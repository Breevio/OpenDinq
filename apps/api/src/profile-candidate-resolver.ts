import { createHash } from "node:crypto";
import {
  searchArxivPapers,
  searchGitHubUsers,
  searchOpenAlexAuthors,
  searchOrcidRecords
} from "@opendinq/connectors";
import type { EvidenceRecord as CoreEvidenceRecord, IdentitySourceRecord, OpenDinqStore } from "@opendinq/core";
import { isNearTokenMatch } from "@opendinq/search";

export type ProfileCandidate = {
  id: string;
  displayName: string;
  headline?: string;
  handle?: string;
  sourceType: "existing_profile" | "openalex" | "orcid" | "arxiv" | "github" | "website" | "manual" | "web";
  kind?: "biography";
  sourceId?: string;
  sourceUrl?: string;
  confidence: number;
  evidencePreview: CoreEvidenceRecord[];
  reasons: string[];
  warnings: string[];
  sources?: ProfileCandidateSource[];
  raw?: unknown;
};

export type ProfileCandidateSource = {
  sourceType: ProfileCandidate["sourceType"];
  sourceId?: string;
  sourceUrl?: string;
  confidence: number;
  evidencePreview: CoreEvidenceRecord[];
  reasons: string[];
  warnings: string[];
};

export type ProfileResolutionResult = {
  rawInput: string;
  queryType: "person_name" | "source_url" | "natural_language" | "role_search" | "unknown";
  candidates: ProfileCandidate[];
  autoSelectedCandidateId?: string;
  needsSelection: boolean;
  warnings: string[];
};

type ProfileCandidateResolverOptions = {
  store: OpenDinqStore;
  fetchImpl?: typeof fetch;
  githubToken?: string;
};

export class ProfileCandidateResolver {
  private readonly cache = new Map<string, ProfileCandidate>();

  constructor(private readonly options: ProfileCandidateResolverOptions) {}

  async resolve(rawInput: string): Promise<ProfileResolutionResult> {
    const queryType = classifyCandidateQuery(rawInput);
    const warnings: string[] = [];
    const candidates: ProfileCandidate[] = [];

    candidates.push(...await existingProfileCandidates(rawInput, queryType, this.options.store));

    const direct = sourceCandidateFromInput(rawInput);
    if (direct) {
      candidates.push(direct);
    } else if (queryType === "person_name" || queryType === "natural_language" || queryType === "role_search") {
      for (const searchQuery of candidateSearchQueries(rawInput)) {
        const connectorSearches = [
          searchConnector("OpenAlex", warnings, async () => {
            candidates.push(...openAlexCandidates(searchQuery, await searchOpenAlexAuthors(searchQuery, { fetchImpl: this.options.fetchImpl })));
          }),
          searchConnector("GitHub", warnings, async () => {
            candidates.push(...githubCandidates(searchQuery, await searchGitHubUsers(searchQuery, { fetchImpl: this.options.fetchImpl, token: this.options.githubToken })));
          }),
          searchConnector("ORCID", warnings, async () => {
            candidates.push(...orcidCandidates(searchQuery, await searchOrcidRecords(searchQuery, { fetchImpl: this.options.fetchImpl })));
          }),
          searchConnector("arXiv", warnings, async () => {
            candidates.push(...arxivCandidates(searchQuery, await searchArxivPapers(searchQuery, { fetchImpl: this.options.fetchImpl })));
          })
        ];
        if (shouldSearchPublicWebCandidate(rawInput, queryType)) {
          connectorSearches.push(searchConnector("Public web", warnings, async () => {
            candidates.push(...await publicWebCandidates(searchQuery, { fetchImpl: this.options.fetchImpl }));
          }));
        }
        await Promise.all(connectorSearches);
        if (candidates.length > 0) {
          break;
        }
      }
      if (filterLowRelevanceCandidates(dedupeCandidates(candidates), rawInput, queryType).length === 0) {
        await Promise.all(candidateFallbackSearchQueries(rawInput).map((searchQuery) => searchConnector("OpenAlex", warnings, async () => {
          candidates.push(...openAlexCandidates(searchQuery, await searchOpenAlexAuthors(searchQuery, { fetchImpl: this.options.fetchImpl })));
        })));
      }
    }

    const filtered = contextualizeCandidateConfidence(filterLowRelevanceCandidates(dedupeCandidates(candidates), rawInput, queryType), rawInput, queryType);
    const ranked = clusterPersonCandidates(filtered, rawInput)
      .toSorted((left, right) =>
        contextualRankScore(right, rawInput, queryType) - contextualRankScore(left, rawInput, queryType)
        || sourcePriority(left) - sourcePriority(right)
        || left.displayName.localeCompare(right.displayName)
      )
      .slice(0, 8);
    for (const candidate of ranked) {
      this.cache.set(candidate.id, candidate);
    }
    const autoSelectedCandidateId = autoSelectedCandidate(ranked, rawInput)?.id;

    return {
      rawInput,
      queryType,
      candidates: ranked,
      autoSelectedCandidateId,
      needsSelection: ranked.length > 0 && !autoSelectedCandidateId,
      warnings: ranked.length === 0 ? [...warnings, "No public candidate found yet. OpenDinq can still create a review workspace from your description."] : warnings
    };
  }

  getCandidate(candidateId: string): ProfileCandidate | undefined {
    return this.cache.get(candidateId);
  }
}

function classifyCandidateQuery(input: string): ProfileResolutionResult["queryType"] {
  const trimmed = input.trim();
  if (isHttpUrl(trimmed) || /^[A-Z]\d{4,}$/i.test(trimmed) || /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(trimmed) || /^\d{4}\.\d{4,5}/.test(trimmed)) {
    return "source_url";
  }
  if (personLikeInput(trimmed)) {
    return "person_name";
  }
  if (/\b(engineer|researcher|designer|builder|maintainer|working on|works on)\b/i.test(trimmed)) {
    return "role_search";
  }
  return trimmed ? "natural_language" : "unknown";
}

async function existingProfileCandidates(
  input: string,
  queryType: ProfileResolutionResult["queryType"],
  store: OpenDinqStore
): Promise<ProfileCandidate[]> {
  const normalized = candidateSearchQuery(input).toLowerCase();
  if (!normalized) {
    return [];
  }
  const terms = meaningfulTerms(normalized);
  const profiles = await store.listProfiles();
  return profiles
    .filter((profile) => matchesExistingProfileCandidate(profile, normalized, terms, queryType))
    .slice(0, 5)
    .map((profile) => candidate({
      displayName: profile.person.displayName,
      headline: profile.person.headline,
      handle: profile.person.handle,
      sourceType: "existing_profile",
      sourceId: profile.person.handle,
      sourceUrl: `/u/${profile.person.handle}`,
      confidence: profile.person.displayName.toLowerCase() === normalized ? 0.92 : 0.72,
      evidencePreview: existingProfileEvidencePreview(profile),
      reasons: ["Matched an existing OpenDinq profile."],
      warnings: [],
      raw: {
        profileHandle: profile.person.handle,
        profileSources: profile.sources
      }
    }));
}

function matchesExistingProfileCandidate(
  profile: Awaited<ReturnType<OpenDinqStore["listProfiles"]>>[number],
  normalizedQuery: string,
  terms: string[],
  queryType: ProfileResolutionResult["queryType"]
): boolean {
  const searchable = `${profile.person.displayName} ${profile.person.handle} ${profile.person.headline ?? ""}`.toLowerCase();
  if (searchable.includes(normalizedQuery)) {
    return true;
  }
  if (queryType !== "person_name" && queryType !== "source_url") {
    return false;
  }
  if (terms.length > 0 && terms.every((term) => searchable.includes(term))) {
    return true;
  }
  const compactHandle = compactIdentifier(profile.person.handle);
  const lastTerm = terms.at(-1);
  return Boolean(compactHandle && lastTerm && terms.length >= 2 && compactHandle === lastTerm);
}

function existingProfileEvidencePreview(profile: Awaited<ReturnType<OpenDinqStore["listProfiles"]>>[number]) {
  const artifacts = profile.artifacts.filter((artifact) => {
    const source = artifact.metadata?.source;
    const evidenceStatus = artifact.metadata?.evidenceStatus;
    return !(source === "opendinq-review" || (source === "manual" && evidenceStatus === "user_provided"));
  });
  const previewArtifacts = artifacts.length > 0 ? artifacts : profile.artifacts;
  return previewArtifacts
    .slice(0, 3)
    .map((artifact) => evidencePreview(artifact.id ?? artifact.url ?? artifact.title, "artifact", artifact.title, artifact.url, "Existing OpenDinq profile contains this artifact."));
}

function directSourceCandidate(input: string): ProfileCandidate | undefined {
  const trimmed = input.trim();
  if (/^https?:\/\/(?:www\.)?openalex\.org\/A\d+$/i.test(trimmed) || /^A\d{4,}$/i.test(trimmed)) {
    const id = trimmed.match(/(A\d+)$/i)?.[1]?.toUpperCase() ?? trimmed;
    return candidate({
      displayName: id,
      sourceType: "openalex",
      sourceId: id,
      sourceUrl: `https://openalex.org/${id}`,
      confidence: 0.94,
      evidencePreview: [evidencePreview(id, "external", `OpenAlex author ${id}`, `https://openalex.org/${id}`, "User supplied this OpenAlex source.")],
      reasons: ["Direct OpenAlex source provided."],
      warnings: []
    });
  }
  if (/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(trimmed)) {
    return candidate({
      displayName: trimmed,
      sourceType: "orcid",
      sourceId: trimmed,
      sourceUrl: `https://orcid.org/${trimmed}`,
      confidence: 0.94,
      evidencePreview: [evidencePreview(trimmed, "external", `ORCID ${trimmed}`, `https://orcid.org/${trimmed}`, "User supplied this ORCID source.")],
      reasons: ["Direct ORCID source provided."],
      warnings: []
    });
  }
  if (/^\d{4}\.\d{4,5}(v\d+)?$/i.test(trimmed)) {
    return candidate({
      displayName: trimmed,
      sourceType: "arxiv",
      sourceId: trimmed,
      sourceUrl: `https://arxiv.org/abs/${trimmed}`,
      confidence: 0.9,
      evidencePreview: [evidencePreview(trimmed, "external", `arXiv ${trimmed}`, `https://arxiv.org/abs/${trimmed}`, "User supplied this arXiv source.")],
      reasons: ["Direct arXiv source provided."],
      warnings: []
    });
  }
  const github = githubHandleFromDirectInput(trimmed);
  if (github) {
    return candidate({
      displayName: github,
      handle: github,
      sourceType: "github",
      sourceId: github,
      sourceUrl: `https://github.com/${github}`,
      confidence: 0.96,
      evidencePreview: [evidencePreview(`https://github.com/${github}`, "external", `GitHub profile ${github}`, `https://github.com/${github}`, "User supplied this GitHub source.")],
      reasons: ["Direct GitHub source provided."],
      warnings: []
    });
  }
  if (isHttpUrl(trimmed)) {
    return candidate({
      displayName: new URL(trimmed).hostname,
      sourceType: "website",
      sourceId: trimmed,
      sourceUrl: trimmed,
      confidence: 0.88,
      evidencePreview: [evidencePreview(trimmed, "external", trimmed, trimmed, "User supplied this website source.")],
      reasons: ["Direct website source provided."],
      warnings: []
    });
  }
  return undefined;
}

function sourceCandidateFromInput(input: string): ProfileCandidate | undefined {
  return directSourceCandidate(input) ?? embeddedSourceCandidate(input);
}

function embeddedSourceCandidate(input: string): ProfileCandidate | undefined {
  const text = input.trim();
  const url = text.match(/https?:\/\/\S+/i)?.[0]?.replace(/[),.;]+$/, "");
  if (url) {
    return directSourceCandidate(url);
  }

  const orcid = text.match(/\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/i)?.[0];
  if (orcid) {
    return directSourceCandidate(orcid);
  }

  const arxiv = text.match(/\b\d{4}\.\d{4,5}(?:v\d+)?\b/i)?.[0];
  if (arxiv) {
    return directSourceCandidate(arxiv);
  }

  const openAlex = text.match(/\bA\d{4,}\b/i)?.[0];
  if (openAlex) {
    return directSourceCandidate(openAlex);
  }

  const githubMention = text.match(/(?:github\.com\/|github\s+(?:user|profile|handle)?\s*[:=]?\s*)([A-Za-z0-9][A-Za-z0-9-]{1,38})/i)?.[1];
  if (githubMention) {
    return directSourceCandidate(`https://github.com/${githubMention}`);
  }

  const explicitMention = text.match(/(?:^|\s)@([A-Za-z0-9][A-Za-z0-9-]{1,38})(?:\s|$)/)?.[1];
  if (explicitMention) {
    return directSourceCandidate(`https://github.com/${explicitMention}`);
  }

  return undefined;
}

function githubHandleFromDirectInput(input: string): string | undefined {
  const handle = input.match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/?$/i)?.[1]
    ?? (/^[A-Za-z0-9-]{2,39}$/.test(input) && !/^[A-Z]\d+$/i.test(input) ? input : undefined);
  if (!handle || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(handle)) {
    return undefined;
  }
  return handle;
}

function openAlexCandidates(query: string, authors: Awaited<ReturnType<typeof searchOpenAlexAuthors>>): ProfileCandidate[] {
  const normalized = candidateSearchQuery(query).toLowerCase();
  return authors.slice(0, 5).map((author) => {
    const exact = author.display_name.toLowerCase() === normalized;
    const confidence = Math.min(0.9, (exact ? 0.72 : 0.58) + termMatchBoost(query, author.display_name) + Math.min(0.1, (author.works_count ?? 0) / 1000) + Math.min(0.08, (author.cited_by_count ?? 0) / 20000));
    return candidate({
      displayName: author.display_name,
      headline: [
        author.last_known_institutions?.[0]?.display_name,
        typeof author.works_count === "number" ? `${author.works_count} works` : undefined,
        typeof author.cited_by_count === "number" ? `${author.cited_by_count} citations` : undefined,
        author.summary_stats?.h_index ? `h-index ${author.summary_stats.h_index}` : undefined
      ].filter(Boolean).join(" · ") || undefined,
      sourceType: "openalex",
      sourceId: author.id,
      sourceUrl: author.id,
      confidence,
      evidencePreview: [evidencePreview(author.id, "external", author.display_name, author.id, "OpenAlex author search returned this public candidate.")],
      reasons: [exact ? "Exact name match in OpenAlex author search." : "OpenAlex author search candidate.", "Public research metadata can be imported for review."],
      warnings: exact && confidence < 0.86 ? ["Name match may still be ambiguous; review imported evidence before publishing."] : [],
      raw: author
    });
  });
}

function githubCandidates(query: string, users: Awaited<ReturnType<typeof searchGitHubUsers>>): ProfileCandidate[] {
  const normalized = candidateSearchQuery(query).toLowerCase();
  return users.slice(0, 5).filter((user) => user.login).map((user) => {
    const exact = user.login.toLowerCase() === normalized;
    const compactExact = compactIdentifier(user.login) === compactIdentifier(normalized);
    const confidence = Math.min(0.9, (exact ? 0.78 : compactExact ? 0.76 : 0.54) + termMatchBoost(query, user.login) + Math.min(0.06, (user.score ?? 0) / 100));
    return candidate({
      displayName: user.login,
      handle: user.login,
      headline: "GitHub user search result",
      sourceType: "github",
      sourceId: user.login,
      sourceUrl: user.html_url,
      confidence,
      evidencePreview: [evidencePreview(user.html_url, "external", `GitHub profile ${user.login}`, user.html_url, "GitHub user search returned this public candidate.")],
      reasons: [exact ? "Exact GitHub handle match." : "GitHub user search candidate.", "Public repositories can be imported as evidence."],
      warnings: confidence < 0.7 ? ["GitHub result may not match the requested person; confirm before generation."] : [],
      raw: user
    });
  });
}

function orcidCandidates(query: string, records: Awaited<ReturnType<typeof searchOrcidRecords>>): ProfileCandidate[] {
  const normalized = candidateSearchQuery(query).toLowerCase();
  return records.slice(0, 5).filter((record) => record["orcid-id"]).map((record) => {
    const displayName = record["credit-name"] || [record["given-names"], record["family-names"]].filter(Boolean).join(" ") || record["orcid-id"] || "ORCID candidate";
    const exact = displayName.toLowerCase() === normalized;
    const institution = record.institution?.slice(0, 2).join(" · ");
    const confidence = Math.min(0.88, (exact ? 0.74 : 0.58) + termMatchBoost(query, `${displayName} ${institution ?? ""}`) + (institution ? 0.04 : 0));
    const id = record["orcid-id"] ?? displayName;
    return candidate({
      displayName,
      headline: institution,
      sourceType: "orcid",
      sourceId: id,
      sourceUrl: `https://orcid.org/${id}`,
      confidence,
      evidencePreview: [evidencePreview(id, "external", `ORCID record ${displayName}`, `https://orcid.org/${id}`, "ORCID public search returned this candidate.")],
      reasons: [exact ? "Exact ORCID name match." : "ORCID public search candidate.", "ORCID works can be imported as reviewable evidence."],
      warnings: exact && confidence < 0.82 ? ["Name match may still be ambiguous; confirm ORCID identity before generation."] : [],
      raw: record
    });
  });
}

function arxivCandidates(query: string, papers: Awaited<ReturnType<typeof searchArxivPapers>>): ProfileCandidate[] {
  const normalized = candidateSearchQuery(query).toLowerCase();
  return papers.slice(0, 5).map((paper) => {
    const matchingAuthor = paper.authors.find((author) => author.toLowerCase() === normalized)
      ?? paper.authors.find((author) => termMatchBoost(query, author) > 0)
      ?? paper.authors[0];
    const displayName = matchingAuthor ?? paper.title;
    const exact = displayName.toLowerCase() === normalized;
    const confidence = Math.min(0.82, (exact ? 0.7 : 0.52) + termMatchBoost(query, `${displayName} ${paper.title} ${paper.summary}`) + Math.min(0.04, paper.authors.length / 100));
    return candidate({
      displayName,
      headline: paper.title,
      sourceType: "arxiv",
      sourceId: paper.id,
      sourceUrl: paper.url,
      confidence,
      evidencePreview: [evidencePreview(paper.id, "external", paper.title, paper.url, "arXiv search returned this public paper candidate.")],
      reasons: [exact ? "Exact arXiv author match." : "arXiv search candidate.", "The selected paper can seed a reviewable research profile."],
      warnings: ["arXiv identifies papers, not people; confirm this paper belongs to the intended person."],
      raw: paper
    });
  });
}

type WikipediaSummary = {
  title?: string;
  extract?: string;
  description?: string;
  type?: string;
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
};

async function publicWebCandidates(query: string, options: { fetchImpl?: typeof fetch } = {}): Promise<ProfileCandidate[]> {
  const name = personNameHint(query) ?? personLikeInput(query);
  if (!name) {
    return [];
  }
  const summary = await fetchWikipediaSummary(name, options);
  if (!summary || summary.type === "disambiguation") {
    return [];
  }
  const title = summary.title?.trim();
  const url = summary.content_urls?.desktop?.page;
  if (!title || !url || !isHttpUrl(url) || !wikipediaTitleMatchesName(title, name)) {
    return [];
  }
  return [candidate({
    displayName: title,
    headline: summary.description,
    sourceType: "website",
    kind: "biography",
    sourceId: url,
    sourceUrl: url,
    confidence: 0.88,
    evidencePreview: [evidencePreview(url, "external", title, url, "Wikipedia returned this public biography page.")],
    reasons: ["Public web biography page found.", "Use this public source as a starting point for review."],
    warnings: ["Public web biographies can still describe the wrong person; review before generation."],
    raw: summary
  })];
}

async function fetchWikipediaSummary(name: string, options: { fetchImpl?: typeof fetch } = {}): Promise<WikipediaSummary | undefined> {
  const title = name.trim().replace(/\s+/g, "_");
  if (!title) {
    return undefined;
  }
  const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const response = await (options.fetchImpl ?? fetch)(endpoint, {
    headers: { accept: "application/json" }
  });
  if (!response.ok) {
    return undefined;
  }
  return response.json() as Promise<WikipediaSummary>;
}

function wikipediaTitleMatchesName(title: string, name: string): boolean {
  const titleName = normalizeName(title.replace(/\s+\(.+\)$/, ""));
  const requestedName = normalizeName(name);
  return titleName === requestedName;
}

function autoSelectedCandidate(candidates: ProfileCandidate[], rawInput: string): ProfileCandidate | undefined {
  const [top, second] = candidates;
  if (!top) {
    return undefined;
  }
  if (!candidateIdentityMatchesRawInput(top, rawInput)) {
    return undefined;
  }
  if (shouldRequireSelectionForPersonName(top, rawInput)) {
    return undefined;
  }
  if (isOrdinaryPersonNameAcademicCandidate(top, rawInput)) {
    return undefined;
  }
  if (second && top.confidence - second.confidence < 0.12) {
    return undefined;
  }
  if (top.confidence >= 0.93) {
    return top;
  }
  if (top.confidence >= 0.86 && (!second || top.confidence - second.confidence >= 0.15)) {
    return top;
  }
  return undefined;
}

function contextualizeCandidateConfidence(
  candidates: ProfileCandidate[],
  rawInput: string,
  queryType: ProfileResolutionResult["queryType"]
): ProfileCandidate[] {
  if (queryType !== "person_name" || sourceCandidateFromInput(rawInput) || hasAcademicIntent(rawInput)) {
    return candidates;
  }
  return candidates.map((item) => {
    if (!isAcademicCandidate(item)) {
      return item;
    }
    const confidence = Math.min(item.confidence, 0.78);
    return {
      ...item,
      confidence,
      sources: item.sources?.map((source) => isAcademicSourceType(source.sourceType) ? { ...source, confidence: Math.min(source.confidence, 0.78) } : source),
      warnings: uniqueStrings([...item.warnings, "Academic record match needs confirmation for a general person-name search."])
    };
  });
}

function contextualRankScore(candidate: ProfileCandidate, rawInput: string, queryType: ProfileResolutionResult["queryType"]): number {
  if (queryType === "person_name" && isOrdinaryPersonNameAcademicCandidate(candidate, rawInput)) {
    return Math.min(candidate.confidence, 0.78);
  }
  return candidate.confidence;
}

function isOrdinaryPersonNameAcademicCandidate(candidate: ProfileCandidate, rawInput: string): boolean {
  return personNameHint(rawInput) !== undefined
    && !sourceCandidateFromInput(rawInput)
    && !hasAcademicIntent(rawInput)
    && isAcademicCandidate(candidate);
}

function isAcademicCandidate(candidate: ProfileCandidate): boolean {
  return candidateSources(candidate).some((source) => isAcademicSourceType(source.sourceType));
}

function isAcademicSourceType(sourceType: ProfileCandidate["sourceType"]): boolean {
  return sourceType === "openalex" || sourceType === "orcid" || sourceType === "arxiv";
}

function hasAcademicIntent(input: string): boolean {
  return /\b(academic|academia|author|arxiv|citation|citations|cited|doi|faculty|h-?index|lab|labs|openalex|orcid|paper|papers|phd|professor|publication|publications|researcher|scholar|scholarly|stanford|university)\b/i.test(input);
}

function shouldSearchPublicWebCandidate(rawInput: string, queryType: ProfileResolutionResult["queryType"]): boolean {
  return (queryType === "person_name" || queryType === "natural_language")
    && personNameHint(rawInput) !== undefined
    && !sourceCandidateFromInput(rawInput)
    && !hasAcademicIntent(rawInput);
}

function shouldRequireSelectionForPersonName(candidate: ProfileCandidate, rawInput: string): boolean {
  if (sourceCandidateFromInput(rawInput) || !personNameHint(rawInput)) {
    return false;
  }
  const publicSources = candidateSources(candidate)
    .filter((source) => source.sourceType !== "existing_profile" && source.sourceType !== "manual");
  const distinctPublicSources = new Set(publicSources.map((source) => `${source.sourceType}:${source.sourceId ?? source.sourceUrl ?? ""}`));
  if (distinctPublicSources.size > 1) {
    return true;
  }
  return candidate.warnings.some((warning) => /\bambiguous\b|confirm before generation|confirm before publishing|review before generation/i.test(warning));
}

function candidateIdentityMatchesRawInput(candidate: ProfileCandidate, rawInput: string): boolean {
  if (sourceCandidateFromInput(rawInput)) {
    return true;
  }
  const hint = personNameHint(rawInput);
  if (!hint) {
    return true;
  }
  const identityTerms = meaningfulTerms(`${candidate.displayName} ${candidate.handle ?? ""}`);
  const hintTerms = meaningfulTerms(hint);
  return hintTerms.length > 0 && hintTerms.every((term) => identityTerms.some((identityTerm) => identityTerm === term || isNearTokenMatch(term, identityTerm)));
}

function clusterPersonCandidates(candidates: ProfileCandidate[], query: string): ProfileCandidate[] {
  const clusters: ProfileCandidate[][] = [];
  for (const item of candidates) {
    const matchingClusters = clusters.filter((cluster) => cluster.some((candidate) => canCluster(candidate, item, query)));
    if (matchingClusters.length === 0) {
      clusters.push([item]);
      continue;
    }

    const [primaryCluster, ...otherClusters] = matchingClusters;
    primaryCluster?.push(item);
    for (const cluster of otherClusters) {
      primaryCluster?.push(...cluster);
      const index = clusters.indexOf(cluster);
      if (index >= 0) {
        clusters.splice(index, 1);
      }
    }
  }
  return clusters.map(mergeCluster);
}

function canCluster(left: ProfileCandidate | undefined, right: ProfileCandidate, query: string): boolean {
  if (!left) {
    return false;
  }
  if (left.id === right.id) {
    return true;
  }
  if (left.sourceType === right.sourceType) {
    return false;
  }
  if (left.sourceType === "existing_profile" || right.sourceType === "existing_profile") {
    return existingProfileClusterMatch(left, right);
  }
  const leftOrcid = candidateOrcid(left);
  const rightOrcid = candidateOrcid(right);
  if (leftOrcid && rightOrcid && leftOrcid === rightOrcid) {
    return true;
  }
  const sameName = normalizeName(left.displayName) === normalizeName(right.displayName);
  if (!sameName) {
    return false;
  }
  const leftAffiliations = affiliationTerms(left);
  const rightAffiliations = affiliationTerms(right);
  if (leftAffiliations.some((term) => rightAffiliations.includes(term))) {
    return true;
  }
  const queryTerms = meaningfulTerms(query);
  if (queryTerms.length > 2) {
    const leftContext = candidateContext(left);
    const rightContext = candidateContext(right);
    const matchingTerms = queryTerms.filter((term) => leftContext.includes(term) && rightContext.includes(term));
    return matchingTerms.length >= 2;
  }
  return false;
}

function existingProfileClusterMatch(left: ProfileCandidate, right: ProfileCandidate): boolean {
  if (left.handle && right.handle && left.handle === right.handle) {
    return true;
  }
  const leftIdentity = candidateIdentityKeys(left);
  const rightIdentity = candidateIdentityKeys(right);
  for (const key of leftIdentity) {
    if (rightIdentity.has(key)) {
      return true;
    }
  }
  return hasStoredPublicIdentity(left, right) && normalizeName(left.displayName) === normalizeName(right.displayName);
}

function mergeCluster(items: ProfileCandidate[]): ProfileCandidate {
  if (items.length === 1) {
    return withCandidateSources(items[0]!);
  }
  const sorted = items.toSorted((left, right) => right.confidence - left.confidence || sourcePriority(left) - sourcePriority(right));
  const primary = sorted.find((item) => item.sourceType !== "existing_profile") ?? sorted[0]!;
  const sources = sorted
    .flatMap((item) => candidateSources(item))
    .toSorted((left, right) =>
      mergedSourcePriority(left.sourceType) - mergedSourcePriority(right.sourceType)
      || right.confidence - left.confidence
    );
  const publicSourceCount = sources.filter((source) => source.sourceType !== "existing_profile" && source.sourceType !== "manual").length;
  const existingProfileCount = sources.filter((source) => source.sourceType === "existing_profile").length;
  const confidence = Math.min(0.96, Math.max(...sorted.map((item) => item.confidence)) + Math.min(0.06, (sources.length - 1) * 0.02));
  return {
    ...primary,
    id: `person:${hashCandidate(sources.map((source) => `${source.sourceType}:${source.sourceId ?? source.sourceUrl ?? ""}`).join("|"))}`,
    sourceType: primary.sourceType,
    sourceId: primary.sourceId,
    sourceUrl: primary.sourceUrl,
    confidence,
    headline: mergeHeadline(sorted),
    evidencePreview: uniqueEvidence(sorted.flatMap((item) => item.evidencePreview)).slice(0, 5),
    reasons: [
      clusterReasonSummary(publicSourceCount, existingProfileCount),
      ...uniqueStrings(sorted.flatMap((item) => item.reasons)).slice(0, 3)
    ],
    warnings: uniqueStrings(sorted.flatMap((item) => item.warnings)),
    sources,
    raw: sorted.map((item) => item.raw ?? item)
  };
}

function withCandidateSources(item: ProfileCandidate): ProfileCandidate {
  return { ...item, sources: candidateSources(item) };
}

function candidateSources(item: ProfileCandidate): ProfileCandidateSource[] {
  return item.sources ?? [{
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    sourceUrl: item.sourceUrl,
    confidence: item.confidence,
    evidencePreview: item.evidencePreview,
    reasons: item.reasons,
    warnings: item.warnings
  }];
}

function mergedSourcePriority(sourceType: ProfileCandidate["sourceType"]): number {
  const priority: Record<ProfileCandidate["sourceType"], number> = {
    openalex: 0,
    orcid: 1,
    github: 2,
    arxiv: 3,
    website: 4,
    web: 5,
    existing_profile: 6,
    manual: 7
  };
  return priority[sourceType];
}

function clusterReasonSummary(publicSourceCount: number, existingProfileCount: number): string {
  if (existingProfileCount > 0 && publicSourceCount > 0) {
    return `Matched ${publicSourceCount} public source record${publicSourceCount === 1 ? "" : "s"} and linked them to an existing OpenDinq profile for the same person.`;
  }
  if (publicSourceCount > 0) {
    return `Matched ${publicSourceCount} public source record${publicSourceCount === 1 ? "" : "s"} that appear to describe the same person.`;
  }
  if (existingProfileCount > 0) {
    return `Matched ${existingProfileCount} existing OpenDinq profile record${existingProfileCount === 1 ? "" : "s"} for the same person.`;
  }
  return "Matched multiple source records that appear to describe the same person.";
}

function sourcePriority(candidate: ProfileCandidate): number {
  const priority: Record<ProfileCandidate["sourceType"], number> = {
    existing_profile: 0,
    openalex: 1,
    orcid: 2,
    github: 3,
    arxiv: 4,
    website: 5,
    web: 6,
    manual: 7
  };
  return priority[candidate.sourceType];
}

function candidateOrcid(candidate: ProfileCandidate): string | undefined {
  if (candidate.sourceType === "orcid") {
    return candidate.sourceId?.toLowerCase();
  }
  const raw = candidate.raw as { orcid?: string | null } | undefined;
  return raw?.orcid?.split("/").at(-1)?.toLowerCase();
}

function affiliationTerms(candidate: ProfileCandidate): string[] {
  const raw = candidate.raw as { institution?: string[]; last_known_institutions?: Array<{ display_name?: string }> } | undefined;
  return meaningfulTerms([
    candidate.headline,
    ...(raw?.institution ?? []),
    ...(raw?.last_known_institutions?.map((item) => item.display_name ?? "") ?? [])
  ].filter(Boolean).join(" "));
}

function candidateContext(candidate: ProfileCandidate): string {
  return [
    candidate.displayName,
    candidate.headline,
    candidate.handle,
    candidate.reasons.join(" "),
    candidate.evidencePreview.map((item) => `${item.title} ${item.reason}`).join(" ")
  ].filter(Boolean).join(" ").toLowerCase();
}

function mergeHeadline(items: ProfileCandidate[]): string | undefined {
  const headlines = uniqueStrings(items
    .filter((item) => item.sourceType !== "arxiv")
    .map((item) => item.headline)
    .filter((item): item is string => Boolean(item)));
  const filtered = [];
  let usedMetricHeadline = false;
  for (const headline of headlines) {
    const metric = isMetricHeadline(headline);
    if (metric && usedMetricHeadline) {
      continue;
    }
    filtered.push(headline);
    usedMetricHeadline ||= metric;
  }
  return filtered
    .slice(0, 2)
    .join(" · ") || undefined;
}

function isMetricHeadline(headline: string): boolean {
  return /\bworks\b|\bcitations\b|h-index/i.test(headline);
}

function uniqueEvidence(items: CoreEvidenceRecord[]): CoreEvidenceRecord[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.id}:${item.url ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function normalizeName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function candidateIdentityKeys(candidate: ProfileCandidate): Set<string> {
  const keys = new Set<string>();
  addCandidateIdentity(keys, candidate.sourceType, candidate.sourceId, candidate.sourceUrl, candidate.handle);
  const raw = candidate.raw as { profileSources?: IdentitySourceRecord[] } | undefined;
  for (const source of raw?.profileSources ?? []) {
    addCandidateIdentity(keys, source.type, source.externalId, source.url);
  }
  return keys;
}

function hasStoredPublicIdentity(left: ProfileCandidate, right: ProfileCandidate): boolean {
  const existing = left.sourceType === "existing_profile" ? left : right.sourceType === "existing_profile" ? right : undefined;
  if (!existing) {
    return false;
  }
  const raw = existing.raw as { profileSources?: IdentitySourceRecord[] } | undefined;
  return (raw?.profileSources ?? []).some((source) => Boolean(source.url));
}

function addCandidateIdentity(
  keys: Set<string>,
  sourceType: string,
  sourceId?: string,
  sourceUrl?: string,
  handle?: string
): void {
  if (sourceId) {
    keys.add(`${sourceType}:id:${sourceId.toLowerCase()}`);
  }
  if (sourceUrl) {
    keys.add(`${sourceType}:url:${sourceUrl.toLowerCase()}`);
    const githubHandle = githubHandleFromUrl(sourceUrl);
    if (githubHandle) {
      keys.add(`github:id:${githubHandle}`);
      keys.add(`github:url:https://github.com/${githubHandle}`);
    }
    const openAlexId = openAlexIdFromUrl(sourceUrl);
    if (openAlexId) {
      keys.add(`openalex:id:${openAlexId}`);
      keys.add(`openalex:url:https://openalex.org/${openAlexId}`);
    }
    const orcid = orcidFromUrl(sourceUrl);
    if (orcid) {
      keys.add(`orcid:id:${orcid}`);
      keys.add(`orcid:url:https://orcid.org/${orcid}`);
    }
  }
  if (sourceType === "github" && handle) {
    keys.add(`github:id:${handle.toLowerCase()}`);
    keys.add(`github:url:https://github.com/${handle.toLowerCase()}`);
  }
}

function githubHandleFromUrl(input: string): string | undefined {
  const match = input.match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]{2,39})(?:\/)?$/i)?.[1];
  return match?.toLowerCase();
}

function openAlexIdFromUrl(input: string): string | undefined {
  return input.match(/^https?:\/\/(?:www\.)?openalex\.org\/(A\d+)$/i)?.[1]?.toUpperCase();
}

function orcidFromUrl(input: string): string | undefined {
  return input.match(/^https?:\/\/(?:www\.)?orcid\.org\/([\dX-]+)$/i)?.[1]?.toLowerCase();
}

async function searchConnector(name: string, warnings: string[], run: () => Promise<void>): Promise<void> {
  try {
    await withTimeout(run(), connectorSearchTimeoutMs(), `${name} candidate search timed out.`);
  } catch (error) {
    warnings.push(`${name} candidate search was unavailable: ${error instanceof Error ? error.message : "request failed"}`);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function connectorSearchTimeoutMs(): number {
  const configured = Number(process.env.OPEN_DINQ_CONNECTOR_SEARCH_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 8000;
}

function dedupeCandidates(candidates: ProfileCandidate[]): ProfileCandidate[] {
  const byId = new Map<string, ProfileCandidate>();
  for (const item of candidates) {
    const existing = byId.get(item.id);
    if (!existing || item.confidence > existing.confidence) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

function candidate(input: Omit<ProfileCandidate, "id"> & { id?: string }): ProfileCandidate {
  const id = input.id ?? `${input.sourceType}:${hashCandidate(input.sourceId ?? input.sourceUrl ?? input.handle ?? input.displayName)}`;
  return { ...input, id };
}

function hashCandidate(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function evidencePreview(id: string, type: CoreEvidenceRecord["type"], title: string, url: string | undefined, reason: string): CoreEvidenceRecord {
  return { id, type, title, url, reason };
}

function candidateSearchQuery(input: string): string {
  const direct = directSourceCandidate(input);
  if (direct?.sourceId) {
    return direct.sourceId;
  }
  const text = input.trim();
  const quoted = text.match(/["“'‘]([^"”'’]{2,80})["”'’]/)?.[1]?.trim();
  if (quoted) {
    return quoted;
  }
  const url = text.match(/https?:\/\/\S+/i)?.[0];
  if (url) {
    return url.replace(/[),.;]+$/, "");
  }
  const githubMention = text.match(/(?:github\.com\/|github\s+(?:user|profile|handle)?\s*[:=]?\s*)([A-Za-z0-9-]{2,39})/i)?.[1];
  if (githubMention) {
    return githubMention;
  }
  const explicitMention = text.match(/(?:^|\s)@([A-Za-z0-9][A-Za-z0-9-]{1,38})(?:\s|$)/)?.[1];
  if (explicitMention) {
    return explicitMention;
  }
  const nameLike = personNameHint(text);
  if (nameLike && !meaninglessQueryTerm(nameLike)) {
    return nameLike;
  }
  const compactHandle = text.match(/(?:^|\s)([A-Za-z0-9][A-Za-z0-9-]{1,38})(?:\s|$)/g)
    ?.map((match) => match.trim().replace(/^@/, ""))
    .find((term) => /^[A-Za-z0-9-]{2,39}$/.test(term) && !meaninglessQueryTerm(term));
  const terms = meaningfulTerms(text);
  if (terms.length >= 2) {
    return terms.slice(0, 4).join(" ");
  }
  if (terms.length === 1) {
    return terms[0]!;
  }
  return compactHandle ?? text.replace(/^generate a profile (for|from)\s+/i, "").trim();
}

function candidateSearchQueries(input: string): string[] {
  const primary = candidateSearchQuery(input);
  const variants = [primary];
  const name = personNameHint(input);
  if (name) {
    variants.push(name);
  }
  const terms = meaningfulTerms(input);
  const primaryTerms = meaningfulTerms(primary);
  const contextTerms = terms.filter((term) => !primaryTerms.includes(term));

  if (primaryTerms.length >= 2 && contextTerms.length >= 2) {
    variants.push([primaryTerms[0], ...contextTerms.slice(0, 4)].filter(Boolean).join(" "));
  }
  if (terms.length > primaryTerms.length && terms.length >= 3) {
    variants.push(terms.slice(0, 5).join(" "));
  }

  return uniqueStrings(variants.map((variant) => variant.trim()).filter(Boolean)).slice(0, 3);
}

function candidateFallbackSearchQueries(input: string): string[] {
  const name = personNameHint(input);
  if (!name) {
    return [];
  }

  return uniqueStrings([name, name.split(/\s+/)[0]].filter((query): query is string => Boolean(query && query.length >= 3)));
}

function personNameHint(input: string): string | undefined {
  const candidateText = input
    .replace(/^(?:research|find|search|look\s+up|lookup|generate|create|build|show|get|return)\b(?:\s+(?:a|an|the|profile|cards?|for|about|on|of)\b)*\s*/i, "")
    .trim();
  const capitalized = candidateText.match(/\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3})\b/)?.[1]?.trim();
  if (capitalized && !meaninglessQueryTerm(capitalized)) {
    return capitalized;
  }

  const terms = meaningfulTerms(candidateText);
  if (terms.length >= 2 && terms[0] && terms[1] && terms[0].length >= 3 && terms[1].length >= 3) {
    return `${terms[0]} ${terms[1]}`;
  }
  return undefined;
}

function termMatchBoost(query: string, target: string): number {
  const queryTerms = meaningfulTerms(query);
  if (queryTerms.length === 0) {
    return 0;
  }
  const normalizedTarget = target.toLowerCase();
  const targetTerms = meaningfulTerms(target);
  const matches = queryTerms.filter((term) => normalizedTarget.includes(term) || targetTerms.some((targetTerm) => isNearTokenMatch(term, targetTerm))).length;
  return Math.min(0.08, matches / queryTerms.length * 0.08);
}

function filterLowRelevanceCandidates(
  candidates: ProfileCandidate[],
  rawInput: string,
  queryType: ProfileResolutionResult["queryType"]
): ProfileCandidate[] {
  if (sourceCandidateFromInput(rawInput)) {
    return candidates;
  }
  const terms = meaningfulTerms(personNameHint(rawInput) ?? rawInput);
  if (terms.length < 2) {
    return candidates;
  }
  const requiredMatches = Math.min(2, terms.length);
  const compactQuery = terms.join("");
  return candidates.filter((candidate) => {
    if (candidate.sourceType === "existing_profile" || candidate.confidence >= 0.93) {
      return true;
    }
    if (queryType === "person_name" && isStrongGithubPersonNameCandidate(candidate, terms)) {
      return true;
    }
    const context = candidateContext(candidate);
    const compactContext = compactIdentifier(context);
    const compactIdentity = compactIdentifier(`${candidate.displayName} ${candidate.handle ?? ""}`);
    if (compactQuery.length >= 6 && compactIdentity.includes(compactQuery)) {
      return true;
    }
    const contextTerms = meaningfulTerms(context);
    const matches = terms.filter((term) => contextTerms.includes(term) || compactTermMatches(term, compactContext) || contextTerms.some((contextTerm) => isNearTokenMatch(term, contextTerm))).length;
    return matches >= requiredMatches;
  });
}

function isStrongGithubPersonNameCandidate(candidate: ProfileCandidate, terms: string[]): boolean {
  if (candidate.sourceType !== "github" || terms.length < 2) {
    return false;
  }
  const handle = compactIdentifier(candidate.handle ?? candidate.displayName);
  const first = terms[0];
  const last = terms.at(-1);
  if (!handle || !first || !last) {
    return false;
  }
  const searchScore = githubSearchScore(candidate);
  if (searchScore <= 0) {
    return false;
  }
  return handle === last || handle === `${first}${last}` || handle === `${first[0]}${last}`;
}

function githubSearchScore(candidate: ProfileCandidate): number {
  if (candidate.sourceType !== "github") {
    return 0;
  }
  const raw = candidate.raw as { score?: unknown } | undefined;
  return typeof raw?.score === "number" ? raw.score : 0;
}

function compactTermMatches(term: string, compactContext: string): boolean {
  return term.length >= 8 && compactContext.includes(term);
}

function meaningfulTerms(input: string): string[] {
  const stop = new Set(["a", "an", "the", "for", "from", "who", "with", "and", "or", "on", "in", "of", "to", "working", "works", "work", "citations", "citation", "index", "researcher", "builder", "engineer", "person", "profile", "research", "return", "cards", "card", "find", "search", "look", "lookup", "generate"]);
  return input.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 1 && !/^\d+$/.test(term) && term !== "h" && !stop.has(term));
}

function meaninglessQueryTerm(input: string): boolean {
  const normalized = input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized.split(/\s+/).every((term) => meaningfulTerms(term).length === 0);
}

function compactIdentifier(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function personLikeInput(input: string): string | undefined {
  const normalized = input.replace(/^generate a profile (for|from)\s+/i, "").trim();
  return /^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,3}$/.test(normalized) ? normalized : undefined;
}

function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
