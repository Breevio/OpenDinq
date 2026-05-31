import {
  fetchArxivPaper,
  fetchGitHubRepos,
  fetchGitHubUser,
  fetchOpenAlexAuthor,
  fetchOpenAlexWorks,
  fetchOrcidRecord,
  fetchWebsiteMetadata,
  normalizeArxivPaperToArtifact,
  normalizeGitHubReposToArtifacts,
  normalizeGitHubUserToIdentitySource,
  normalizeGitHubUserToPerson,
  normalizeOpenAlexAuthorToIdentitySource,
  normalizeOpenAlexWorksToArtifacts,
  normalizeOrcidRecordToArtifacts,
  normalizeOrcidRecordToIdentitySource,
  normalizeWebsiteToArtifact,
  parseArxivId,
  parseGitHubProfileUrl
} from "@opendinq/connectors";
import { generateProfileCards, type CardClaim } from "@opendinq/cards";
import { normalizeClaims } from "@opendinq/core";
import {
  createOpenAICompatibleRewriteClient,
  isLlmRewriteEnabled,
  rewriteCardWithEvidence,
  type RewriteEvidenceRef
} from "@opendinq/llm";
import type {
  ArtifactRecord,
  CardRecord,
  EvidenceRecord,
  IdentitySourceRecord,
  OpenDinqStore,
  PersonProfileRecord,
  PersonRecord,
  ProfileClaimRecord,
  ProfileGenerationRunRecord,
  ProfileSourceRecord
} from "@opendinq/core";

export type ProfileGenerationInput = {
  displayName?: string;
  handle?: string;
  headline?: string;
  sources: ProfileGenerationSourceInput[];
};

export type ProfileGenerationSourceInput =
  | { type: "github" | "website" | "openalex" | "arxiv" | "orcid"; input: string }
  | { type: "manual"; input: ManualSourceInput };

export type ManualSourceInput = {
  title?: string;
  url?: string;
  note?: string;
  description?: string;
};

export type NormalizedSourceBundle = {
  source: ProfileSourceRecord;
  identity?: Partial<PersonRecord>;
  artifacts: ArtifactRecord[];
  claims: ProfileClaimRecord[];
  warnings: string[];
};

export type ProfileGenerationSummary = {
  runId: string;
  handle: string;
  status: ProfileGenerationRunRecord["status"];
  profileUrl: string;
  cardsGenerated: number;
  artifactsImported: number;
  claimsGenerated: number;
  warnings: string[];
};

export type ProfileClaimSynthesisHook = (input: {
  person: PersonRecord;
  bundles: NormalizedSourceBundle[];
  artifacts: ArtifactRecord[];
  deterministicClaims: ProfileClaimRecord[];
}) => Promise<ProfileClaimRecord[]> | ProfileClaimRecord[];

export type ProfileGeneratorOptions = {
  store: OpenDinqStore;
  fetchImpl?: typeof fetch;
  githubToken?: string;
  synthesizeClaims?: ProfileClaimSynthesisHook;
};

export function createProfileGenerator(options: ProfileGeneratorOptions) {
  return {
    async generate(input: ProfileGenerationInput): Promise<ProfileGenerationSummary> {
      const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const initialHandle = input.handle ? slugifyHandle(input.handle) : inferHandle(input);
      const displayName = input.displayName ?? titleFromHandle(initialHandle);
      const run: ProfileGenerationRunRecord = {
        id: runId,
        targetHandle: initialHandle,
        displayName,
        status: "running",
        inputJson: input,
        createdAt: now,
        updatedAt: now
      };
      await options.store.createProfileRun(run);

      try {
        const bundles = await normalizeSources(input.sources, runId, options);
        const sourceWarnings = dedupeWarnings(bundles.flatMap((bundle) => bundle.warnings));
        if (bundles.length > 0 && bundles.every((bundle) => bundle.artifacts.length === 0 && bundle.claims.length === 0)) {
          bundles.push(reviewBundleFromFailedSources(input, runId, sourceWarnings.length > 0 ? sourceWarnings : ["No usable public artifacts or claims were imported from the selected source."]));
        }
        const warnings = dedupeWarnings(bundles.flatMap((bundle) => bundle.warnings));
        const identities = bundles.map((bundle) => bundle.identity).filter(Boolean);
        const person = mergePerson(input, initialHandle, displayName, identities);
        const existing = sanitizeExistingProfile(await options.store.getProfile(person.handle), input.sources);
        const sources = dedupeIdentitySources([...(existing?.sources ?? []), ...bundles.map((bundle) => toIdentitySource(bundle.source)).filter((source): source is IdentitySourceRecord => Boolean(source))]);
        const artifacts = dedupeArtifacts([...(existing?.artifacts ?? []), ...bundles.flatMap((bundle) => bundle.artifacts)]);
        const resolvedPerson = shouldReplaceGenericGitHubHeadline(person)
          ? { ...person, headline: inferredHeadlineFromArtifacts(artifacts) ?? person.headline }
          : person;
        const deterministicClaims = [...(existing?.claims ?? []), ...bundles.flatMap((bundle) => bundle.claims)];
        const synthesizedClaims = options.synthesizeClaims
          ? await options.synthesizeClaims({ person: resolvedPerson, bundles, artifacts, deterministicClaims })
          : deterministicClaims;
        const claims = normalizeClaims(synthesizedClaims);

        if (artifacts.length === 0 && claims.length === 0) {
          throw new Error("Profile generation needs at least one artifact or claim.");
        }

        const claimsWithIds = assignClaimIds(resolvedPerson.handle, claims);
        const manualCards = existing?.cards.filter((card) => card.type === "note") ?? [];
        const generatedCards = await maybeRewriteCards(
          generateProfileCards(resolvedPerson, artifacts, claimsWithIds as CardClaim[]) as CardRecord[],
          claimsWithIds
        );
        const cards = [...generatedCards, ...manualCards];
        const profile: PersonProfileRecord = {
          person: resolvedPerson,
          sources,
          artifacts,
          claims: claimsWithIds,
          cards
        };

        await options.store.upsertProfile(profile);
        await options.store.saveProfileSources(resolvedPerson.handle, bundles.map((bundle) => bundle.source));
        await options.store.saveProfileClaims(resolvedPerson.handle, claimsWithIds);
        await options.store.updateProfileRun(runId, {
          status: warnings.length > 0 ? "needs_review" : "completed",
          generatedProfileHandle: resolvedPerson.handle,
          sourceSummaryJson: {
            sourceCount: bundles.length,
            artifactCount: artifacts.length,
            claimCount: claimsWithIds.length
          },
          warningsJson: warnings
        });

        return {
          runId,
          handle: resolvedPerson.handle,
          status: warnings.length > 0 ? "needs_review" : "completed",
          profileUrl: `/u/${resolvedPerson.handle}`,
          cardsGenerated: cards.length,
          artifactsImported: artifacts.length,
          claimsGenerated: claimsWithIds.length,
          warnings
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Profile generation could not complete.";
        await options.store.updateProfileRun(runId, {
          status: "failed",
          errorJson: { message },
          warningsJson: [message]
        });
        throw error;
      }
    }
  };
}

export async function getProfileRunSummary(store: OpenDinqStore, runId: string) {
  const run = await store.getProfileRun(runId);
  if (!run) {
    return undefined;
  }

  const sources = await store.listProfileSources(runId);
  const profile = run.generatedProfileHandle ? await store.getProfile(run.generatedProfileHandle) : undefined;

  return {
    run,
    sources,
    handle: run.generatedProfileHandle,
    warnings: Array.isArray(run.warningsJson) ? run.warningsJson : [],
    cardsCount: profile?.cards.length ?? 0,
    artifactsCount: profile?.artifacts.length ?? 0,
    claimsCount: profile?.claims?.length ?? 0
  };
}

async function normalizeSources(
  sources: ProfileGenerationSourceInput[],
  runId: string,
  options: ProfileGeneratorOptions
): Promise<NormalizedSourceBundle[]> {
  const bundles: NormalizedSourceBundle[] = [];
  for (const source of sources) {
    try {
      bundles.push(await normalizeSource(source, runId, options));
    } catch (error) {
      bundles.push({
        source: {
          type: source.type,
          runId,
          status: "failed",
          warnings: [error instanceof Error ? error.message : "Source failed."]
        },
        artifacts: [],
        claims: [],
        warnings: [`${source.type}: ${error instanceof Error ? error.message : "Source failed."}`]
      });
    }
  }

  return bundles;
}

async function normalizeSource(
  source: ProfileGenerationSourceInput,
  runId: string,
  options: ProfileGeneratorOptions
): Promise<NormalizedSourceBundle> {
  if (source.type === "github") {
    const username = parseGitHubProfileUrl(source.input);
    const fetchOptions = { fetchImpl: options.fetchImpl, token: options.githubToken };
    const user = await fetchGitHubUser(username, fetchOptions);
    const repos = await fetchGitHubRepos(username, fetchOptions);
    const identity = normalizeGitHubUserToPerson(user);
    const identitySource = normalizeGitHubUserToIdentitySource(user);
    const artifacts = normalizeGitHubReposToArtifacts(repos);
    return bundleFrom(source.type, runId, identitySource.url, identitySource.rawJson, identity, artifacts, claimsFromArtifacts(artifacts, "github"));
  }

  if (source.type === "website") {
    const metadata = await fetchWebsiteMetadata(source.input, { fetchImpl: options.fetchImpl });
    const artifact = normalizeWebsiteToArtifact(metadata);
    return bundleFrom("website", runId, metadata.url, metadata, {}, [artifact], [
      claim("link", `Public website: ${metadata.title}`, 0.8, evidenceForArtifact(artifact, "Website supports this profile link."))
    ]);
  }

  if (source.type === "openalex") {
    const author = await fetchOpenAlexAuthor(source.input, { fetchImpl: options.fetchImpl });
    const works = await fetchOpenAlexWorks(author.id, { fetchImpl: options.fetchImpl });
    const sourceRecord = normalizeOpenAlexAuthorToIdentitySource(author);
    const artifacts = normalizeOpenAlexWorksToArtifacts(works);
    return bundleFrom("openalex", runId, sourceRecord.url, sourceRecord.rawJson, { displayName: author.display_name }, artifacts, [
      ...claimsFromArtifacts(artifacts, "openalex"),
      claim("research_area", `Research profile on OpenAlex with ${author.works_count ?? works.length} works`, 0.75, evidenceForSource("openalex", sourceRecord.url, "OpenAlex author record supports this research profile."))
    ]);
  }

  if (source.type === "arxiv") {
    const paper = await fetchArxivPaper(source.input, { fetchImpl: options.fetchImpl });
    const artifact = normalizeArxivPaperToArtifact(paper);
    return bundleFrom("arxiv", runId, paper.url, paper, {}, [artifact], [
      claim("research_area", `Published or referenced arXiv work: ${paper.title}`, 0.85, evidenceForArtifact(artifact, "arXiv paper supports this research claim."))
    ]);
  }

  if (source.type === "orcid") {
    const record = await fetchOrcidRecord(source.input, { fetchImpl: options.fetchImpl });
    const sourceRecord = normalizeOrcidRecordToIdentitySource(record);
    const artifacts = normalizeOrcidRecordToArtifacts(record);
    return bundleFrom("orcid", runId, sourceRecord.url, sourceRecord.rawJson, {}, artifacts, claimsFromArtifacts(artifacts, "orcid"));
  }

  const manual = source.input as ManualSourceInput;
  const manualEvidenceStatus = manual.url ? "explicit" : "user_provided";
  const artifact = manual.url || manual.title ? {
    type: manual.url ? "project" : "note",
    title: manual.title ?? manual.note ?? "Manual note",
    description: manual.description ?? manual.note,
    url: manual.url,
    metadata: { source: "manual", evidenceStatus: manualEvidenceStatus },
    evidenceRaw: manual
  } satisfies ArtifactRecord : undefined;
  const evidence = artifact ? evidenceForArtifact(artifact, manual.url ? "Manual public source supplied by the profile creator." : "User-provided information; add public evidence before treating it as verified.") : evidenceForSource("manual", undefined, "User-provided information; add public evidence before treating it as verified.");
  const bundle = bundleFrom("manual", runId, manual.url, manual, {}, artifact ? [artifact] : [], [
    { ...claim(manual.url ? "project" : "summary", manual.note ?? manual.description ?? manual.title ?? "Manual profile note", manual.url ? 0.7 : 0.45, evidence), status: manual.url ? "approved" : "pending" }
  ]);
  return manual.url ? bundle : {
    ...bundle,
    warnings: ["This profile was generated from user-provided information. Add public sources to strengthen evidence."]
  };
}

function bundleFrom(
  type: ProfileSourceRecord["type"],
  runId: string,
  url: string | undefined,
  rawJson: unknown,
  identity: Partial<PersonRecord>,
  artifacts: ArtifactRecord[],
  claims: ProfileClaimRecord[]
): NormalizedSourceBundle {
  return {
    source: {
      id: `${type}-${runId}`,
      runId,
      type,
      url,
      status: "completed",
      rawJson,
      normalizedJson: { artifacts, claims }
    },
    identity,
    artifacts,
    claims: claims.map((item) => ({ ...item, sourceId: item.sourceId ?? `${type}-${runId}` })),
    warnings: []
  };
}

function reviewBundleFromFailedSources(
  input: ProfileGenerationInput,
  runId: string,
  warnings: string[]
): NormalizedSourceBundle {
  const sourceLabels = input.sources.map((source) => `${source.type}:${source.type === "manual" ? "manual" : source.input}`).join(", ");
  const artifact: ArtifactRecord = {
    type: "note",
    title: "Source import needs review",
    description: `OpenDinq could not import usable public artifacts from ${sourceLabels}. ${warnings.join(" ")}`,
    metadata: {
      source: "opendinq-review",
      attemptedSources: input.sources
    },
    evidenceRaw: {
      attemptedSources: input.sources,
      warnings
    }
  };

  const bundle = bundleFrom("manual", runId, undefined, artifact.evidenceRaw, {}, [artifact], [
    claim(
      "summary",
      "Profile generation needs source review before claims can be trusted.",
      0.35,
      evidenceForArtifact(artifact, "OpenDinq recorded the failed source import so the profile can be reviewed instead of discarded.")
    )
  ]);

  return {
    ...bundle,
    warnings
  };
}

function dedupeWarnings(warnings: string[]): string[] {
  return [...new Set(warnings.filter(Boolean))];
}

function sanitizeExistingProfile(
  profile: PersonProfileRecord | undefined,
  sources: ProfileGenerationSourceInput[]
): PersonProfileRecord | undefined {
  if (!profile || !hasExplicitPublicSource(sources)) {
    return profile;
  }

  const artifacts = profile.artifacts.filter((artifact) => !isTransientReviewArtifact(artifact));
  const removableArtifactKeys = new Set(
    profile.artifacts
      .filter((artifact) => isTransientReviewArtifact(artifact))
      .flatMap((artifact) => [artifact.id, artifact.url, artifact.title].filter((value): value is string => Boolean(value)))
  );
  const claims = (profile.claims ?? []).filter((claim) => !isTransientReviewClaim(claim, removableArtifactKeys));

  return {
    ...profile,
    artifacts,
    claims
  };
}

function hasExplicitPublicSource(sources: ProfileGenerationSourceInput[]): boolean {
  return sources.some((source) => source.type !== "manual" || Boolean(source.input.url));
}

function isTransientReviewArtifact(artifact: ArtifactRecord): boolean {
  const source = artifact.metadata?.source;
  const evidenceStatus = artifact.metadata?.evidenceStatus;
  return source === "opendinq-review" || (source === "manual" && evidenceStatus === "user_provided");
}

function isTransientReviewClaim(claim: ProfileClaimRecord, removableArtifactKeys: Set<string>): boolean {
  if (!claim.evidence.length) {
    return false;
  }
  return claim.evidence.every((item) => {
    return removableArtifactKeys.has(item.id)
      || removableArtifactKeys.has(item.title)
      || item.reason.includes("User-provided information")
      || item.reason.includes("failed source import");
  });
}

function claimsFromArtifacts(artifacts: ArtifactRecord[], sourceType: string): ProfileClaimRecord[] {
  const claims: ProfileClaimRecord[] = [];
  for (const artifact of artifacts) {
    if (artifact.type === "paper") {
      claims.push(claim("research_area", artifact.title, 0.8, evidenceForArtifact(artifact, `${sourceType} artifact supports this research claim.`)));
    } else {
      claims.push(claim("project", artifact.title, 0.78, evidenceForArtifact(artifact, `${sourceType} artifact supports this work claim.`)));
    }

    for (const skill of artifactSkills(artifact)) {
      claims.push(claim("skill", skill, 0.7, evidenceForArtifact(artifact, `${sourceType} artifact supports this skill.`)));
    }
  }

  return claims;
}

function claim(
  type: ProfileClaimRecord["type"],
  text: string,
  confidence: number,
  evidence: EvidenceRecord[],
  sourceId?: string
): ProfileClaimRecord {
  return { type, text, confidence, evidence, sourceId };
}

function evidenceForArtifact(artifact: ArtifactRecord, reason: string): EvidenceRecord[] {
  return [{
    id: artifact.id ?? artifact.url ?? artifact.title,
    type: "artifact",
    title: artifact.title,
    url: artifact.url,
    reason
  }];
}

function evidenceForSource(type: string, url: string | undefined, reason: string): EvidenceRecord[] {
  return [{
    id: type,
    type: "source",
    title: type,
    url,
    reason
  }];
}

function toIdentitySource(source: ProfileSourceRecord): IdentitySourceRecord | undefined {
  if (!source.url) {
    return undefined;
  }
  return {
    id: source.id,
    type: source.type,
    url: source.url,
    rawJson: source.rawJson
  };
}

function mergePerson(
  input: ProfileGenerationInput,
  handle: string,
  displayName: string,
  identities: Array<Partial<PersonRecord> | undefined>
): PersonRecord {
  const identity = identities.find((item) => item?.displayName || item?.avatarUrl || item?.bio) ?? {};
  return {
    handle: input.handle ? slugifyHandle(input.handle) : identity.handle ?? handle,
    displayName: input.displayName ?? identity.displayName ?? displayName,
    headline: input.headline ?? identity.headline ?? identity.bio,
    bio: identity.bio,
    location: identity.location,
    avatarUrl: identity.avatarUrl
  };
}

function shouldReplaceGenericGitHubHeadline(person: PersonRecord): boolean {
  return typeof person.headline === "string" && /^GitHub developer with \d+ public repositories$/i.test(person.headline);
}

function inferredHeadlineFromArtifacts(artifacts: ArtifactRecord[]): string | undefined {
  const topLanguages = [...new Set(artifacts
    .map((artifact) => typeof artifact.metadata?.language === "string" ? artifact.metadata.language.trim() : undefined)
    .filter((language): language is string => Boolean(language))
  )].slice(0, 3);

  if (topLanguages.length === 1) {
    return `Open-source ${topLanguages[0]} developer`;
  }
  if (topLanguages.length === 2) {
    return `Open-source ${topLanguages[0]} and ${topLanguages[1]} developer`;
  }
  if (topLanguages.length >= 3) {
    return `Open-source ${topLanguages[0]}, ${topLanguages[1]}, and ${topLanguages[2]} developer`;
  }
  return "Open-source developer on GitHub";
}

function inferHandle(input: ProfileGenerationInput): string {
  if (input.sources[0]?.type === "github") {
    return parseGitHubProfileUrl(input.sources[0].input);
  }

  return slugifyHandle(input.displayName ?? "generated-profile");
}

function slugifyHandle(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "generated-profile";
}

function titleFromHandle(handle: string): string {
  return handle.split("-").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function assignClaimIds(handle: string, claims: ProfileClaimRecord[]): ProfileClaimRecord[] {
  const usedIds = new Set<string>();
  let nextIndex = 0;

  return claims.map((claim) => {
    if (claim.id && !usedIds.has(claim.id)) {
      usedIds.add(claim.id);
      return claim;
    }

    let id = `claim-${handle}-${nextIndex}`;
    while (usedIds.has(id)) {
      nextIndex += 1;
      id = `claim-${handle}-${nextIndex}`;
    }
    usedIds.add(id);
    nextIndex += 1;
    return { ...claim, id };
  });
}

function artifactSkills(artifact: ArtifactRecord): string[] {
  const metadata = artifact.metadata ?? {};
  const skills = new Set<string>();
  if (typeof metadata.language === "string") {
    skills.add(metadata.language);
  }
  if (Array.isArray(metadata.topics)) {
    for (const topic of metadata.topics) {
      if (typeof topic === "string") {
        skills.add(topic.split(/[-_\s]+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "));
      }
    }
  }
  return [...skills];
}

function dedupeArtifacts(artifacts: ArtifactRecord[]): ArtifactRecord[] {
  const byKey = new Map<string, ArtifactRecord>();
  for (const artifact of artifacts) {
    const key = artifactDedupeKey(artifact);
    const existing = byKey.get(key);
    if (!existing || artifactRank(artifact) > artifactRank(existing)) {
      byKey.set(key, artifact);
    }
  }
  return [...byKey.values()];
}

function artifactDedupeKey(artifact: ArtifactRecord): string {
  if (artifact.type === "paper") {
    const normalizedTitle = artifact.title.toLowerCase().replace(/\((?:preprint|version\s*\d+)\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
    if (normalizedTitle) {
      return `${artifact.type}:title:${normalizedTitle}`;
    }
  }
  return `${artifact.type}:${artifact.url ?? artifact.title}`;
}

function artifactRank(artifact: ArtifactRecord): number {
  const citations = artifact.metadata?.citations;
  return (artifact.url ? 1000 : 0) + (typeof citations === "number" ? citations : 0);
}

function dedupeIdentitySources(sources: IdentitySourceRecord[]): IdentitySourceRecord[] {
  return [...new Map(sources.map((source) => [`${source.type}:${source.url}`, source])).values()];
}

async function maybeRewriteCards(cards: CardRecord[], claims: ProfileClaimRecord[]): Promise<CardRecord[]> {
  if (!isLlmRewriteEnabled()) {
    return cards;
  }

  const apiKey = process.env.OPEN_DINQ_LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return cards;
  }

  const client = createOpenAICompatibleRewriteClient({
    apiKey,
    baseUrl: process.env.OPEN_DINQ_LLM_BASE_URL,
    chatCompletionsUrl: process.env.OPEN_DINQ_LLM_CHAT_COMPLETIONS_URL,
    model: process.env.OPEN_DINQ_LLM_MODEL
  });
  const allowedClaims = claims.filter((claim) => claim.status !== "rejected");

  return Promise.all(cards.map(async (card) => {
    const relevantClaims = allowedClaims.filter((claim) => card.claimIds?.includes(claim.id ?? ""));
    const rewritten = await rewriteCardWithEvidence({
      draftCard: {
        title: card.title,
        contentMd: card.contentMd,
        evidence: card.evidence as RewriteEvidenceRef[],
        claimIds: card.claimIds
      },
      allowedClaims: relevantClaims,
      evidence: card.evidence as RewriteEvidenceRef[]
    }, client);

    return {
      ...card,
      contentMd: rewritten.contentMd,
      evidence: rewritten.evidence as EvidenceRecord[],
      claimIds: rewritten.claimIds
    };
  }));
}
