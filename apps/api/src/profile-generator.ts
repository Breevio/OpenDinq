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

export type ProfileGeneratorOptions = {
  store: OpenDinqStore;
  fetchImpl?: typeof fetch;
  githubToken?: string;
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
        const warnings = bundles.flatMap((bundle) => bundle.warnings);
        const identities = bundles.map((bundle) => bundle.identity).filter(Boolean);
        const person = mergePerson(input, initialHandle, displayName, identities);
        const existing = await options.store.getProfile(person.handle);
        const sources = dedupeIdentitySources([...(existing?.sources ?? []), ...bundles.map((bundle) => toIdentitySource(bundle.source))]);
        const artifacts = dedupeArtifacts([...(existing?.artifacts ?? []), ...bundles.flatMap((bundle) => bundle.artifacts)]);
        const claims = normalizeClaims([...(existing?.claims ?? []), ...bundles.flatMap((bundle) => bundle.claims)]);

        if (artifacts.length === 0 && claims.length === 0) {
          throw new Error("Profile generation needs at least one artifact or claim.");
        }

        const claimsWithIds = claims.map((claim, index) => ({
          id: claim.id ?? `claim-${person.handle}-${index}`,
          ...claim
        }));
        const manualCards = existing?.cards.filter((card) => card.type === "note") ?? [];
        const generatedCards = await maybeRewriteCards(
          generateProfileCards(person, artifacts, claimsWithIds as CardClaim[]) as CardRecord[],
          claimsWithIds
        );
        const cards = [...generatedCards, ...manualCards];
        const profile: PersonProfileRecord = {
          person,
          sources,
          artifacts,
          claims: claimsWithIds,
          cards
        };

        await options.store.upsertProfile(profile);
        await options.store.saveProfileSources(person.handle, bundles.map((bundle) => bundle.source));
        await options.store.saveProfileClaims(person.handle, claimsWithIds);
        await options.store.updateProfileRun(runId, {
          status: warnings.length > 0 ? "needs_review" : "completed",
          generatedProfileHandle: person.handle,
          sourceSummaryJson: {
            sourceCount: bundles.length,
            artifactCount: artifacts.length,
            claimCount: claimsWithIds.length
          },
          warningsJson: warnings
        });

        return {
          runId,
          handle: person.handle,
          status: warnings.length > 0 ? "needs_review" : "completed",
          profileUrl: `/u/${person.handle}`,
          cardsGenerated: cards.length,
          artifactsImported: artifacts.length,
          claimsGenerated: claimsWithIds.length,
          warnings
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Profile generation failed.";
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
  const artifact = manual.url || manual.title ? {
    type: manual.url ? "project" : "note",
    title: manual.title ?? manual.note ?? "Manual note",
    description: manual.description ?? manual.note,
    url: manual.url,
    metadata: { source: "manual" },
    evidenceRaw: manual
  } satisfies ArtifactRecord : undefined;
  const evidence = artifact ? evidenceForArtifact(artifact, "Manual source supplied by the profile creator.") : evidenceForSource("manual", undefined, "Manual note supplied by the profile creator.");
  return bundleFrom("manual", runId, manual.url, manual, {}, artifact ? [artifact] : [], [
    claim(manual.url ? "project" : "summary", manual.note ?? manual.description ?? manual.title ?? "Manual profile note", 0.7, evidence)
  ]);
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

function toIdentitySource(source: ProfileSourceRecord): IdentitySourceRecord {
  return {
    id: source.id,
    type: source.type,
    url: source.url ?? `opendinq://${source.type}/${source.id ?? "source"}`,
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
  return [...new Map(artifacts.map((artifact) => [`${artifact.type}:${artifact.url ?? artifact.title}`, artifact])).values()];
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
