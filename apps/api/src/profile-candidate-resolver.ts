import { createHash } from "node:crypto";
import {
  searchArxivPapers,
  searchGitHubUsers,
  searchOpenAlexAuthors,
  searchOrcidRecords
} from "@opendinq/connectors";
import type { EvidenceRecord as CoreEvidenceRecord, OpenDinqStore } from "@opendinq/core";

export type ProfileCandidate = {
  id: string;
  displayName: string;
  headline?: string;
  handle?: string;
  sourceType: "existing_profile" | "openalex" | "orcid" | "arxiv" | "github" | "website" | "manual" | "web";
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

    candidates.push(...await existingProfileCandidates(rawInput, this.options.store));

    const direct = directSourceCandidate(rawInput);
    if (direct) {
      candidates.push(direct);
    } else if (queryType === "person_name" || queryType === "natural_language" || queryType === "role_search") {
      await Promise.all([
        searchConnector("OpenAlex", warnings, async () => {
          candidates.push(...openAlexCandidates(rawInput, await searchOpenAlexAuthors(candidateSearchQuery(rawInput), { fetchImpl: this.options.fetchImpl })));
        }),
        searchConnector("GitHub", warnings, async () => {
          candidates.push(...githubCandidates(rawInput, await searchGitHubUsers(candidateSearchQuery(rawInput), { fetchImpl: this.options.fetchImpl, token: this.options.githubToken })));
        }),
        searchConnector("ORCID", warnings, async () => {
          candidates.push(...orcidCandidates(rawInput, await searchOrcidRecords(candidateSearchQuery(rawInput), { fetchImpl: this.options.fetchImpl })));
        }),
        searchConnector("arXiv", warnings, async () => {
          candidates.push(...arxivCandidates(rawInput, await searchArxivPapers(candidateSearchQuery(rawInput), { fetchImpl: this.options.fetchImpl })));
        })
      ]);
    }

    const ranked = clusterPersonCandidates(dedupeCandidates(candidates), rawInput)
      .toSorted((left, right) => right.confidence - left.confidence || sourcePriority(left) - sourcePriority(right) || left.displayName.localeCompare(right.displayName))
      .slice(0, 8);
    for (const candidate of ranked) {
      this.cache.set(candidate.id, candidate);
    }
    const autoSelectedCandidateId = autoSelectedCandidate(ranked)?.id;

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

async function existingProfileCandidates(input: string, store: OpenDinqStore): Promise<ProfileCandidate[]> {
  const normalized = candidateSearchQuery(input).toLowerCase();
  if (!normalized) {
    return [];
  }
  const profiles = await store.listProfiles();
  return profiles
    .filter((profile) => `${profile.person.displayName} ${profile.person.handle} ${profile.person.headline ?? ""}`.toLowerCase().includes(normalized))
    .slice(0, 5)
    .map((profile) => candidate({
      displayName: profile.person.displayName,
      headline: profile.person.headline,
      handle: profile.person.handle,
      sourceType: "existing_profile",
      sourceId: profile.person.handle,
      sourceUrl: `/u/${profile.person.handle}`,
      confidence: profile.person.displayName.toLowerCase() === normalized ? 0.92 : 0.72,
      evidencePreview: profile.artifacts.slice(0, 3).map((artifact) => evidencePreview(artifact.id ?? artifact.url ?? artifact.title, "artifact", artifact.title, artifact.url, "Existing OpenDinq profile contains this artifact.")),
      reasons: ["Matched an existing OpenDinq profile."],
      warnings: []
    }));
}

function directSourceCandidate(input: string): ProfileCandidate | undefined {
  const trimmed = input.trim();
  const github = trimmed.match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/?$/i)?.[1] ?? (/^[A-Za-z0-9-]{2,39}$/.test(trimmed) && !/^[A-Z]\d+$/i.test(trimmed) ? trimmed : undefined);
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
    const confidence = Math.min(0.84, (exact ? 0.74 : 0.54) + termMatchBoost(query, user.login) + Math.min(0.06, (user.score ?? 0) / 100));
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

function autoSelectedCandidate(candidates: ProfileCandidate[]): ProfileCandidate | undefined {
  const [top, second] = candidates;
  if (!top) {
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

function clusterPersonCandidates(candidates: ProfileCandidate[], query: string): ProfileCandidate[] {
  const clusters: ProfileCandidate[][] = [];
  for (const item of candidates) {
    const cluster = clusters.find((items) => canCluster(items[0], item, query));
    if (cluster) {
      cluster.push(item);
    } else {
      clusters.push([item]);
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
    return left.handle === right.handle && Boolean(left.handle);
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

function mergeCluster(items: ProfileCandidate[]): ProfileCandidate {
  if (items.length === 1) {
    return withCandidateSources(items[0]!);
  }
  const sorted = items.toSorted((left, right) => right.confidence - left.confidence || sourcePriority(left) - sourcePriority(right));
  const primary = sorted[0]!;
  const sources = sorted.flatMap((item) => candidateSources(item));
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
      `Matched ${sources.length} public source records that appear to describe the same person.`,
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
    candidate.sourceUrl,
    candidate.reasons.join(" "),
    candidate.evidencePreview.map((item) => `${item.title} ${item.reason}`).join(" ")
  ].filter(Boolean).join(" ").toLowerCase();
}

function mergeHeadline(items: ProfileCandidate[]): string | undefined {
  return uniqueStrings(items.map((item) => item.headline).filter((item): item is string => Boolean(item))).slice(0, 2).join(" · ") || undefined;
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

async function searchConnector(name: string, warnings: string[], run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    warnings.push(`${name} candidate search was unavailable: ${error instanceof Error ? error.message : "request failed"}`);
  }
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
  return input.replace(/^generate a profile (for|from)\s+/i, "").trim();
}

function termMatchBoost(query: string, target: string): number {
  const queryTerms = meaningfulTerms(query);
  if (queryTerms.length === 0) {
    return 0;
  }
  const normalizedTarget = target.toLowerCase();
  const matches = queryTerms.filter((term) => normalizedTarget.includes(term)).length;
  return Math.min(0.08, matches / queryTerms.length * 0.08);
}

function meaningfulTerms(input: string): string[] {
  const stop = new Set(["a", "an", "the", "for", "from", "who", "with", "and", "or", "on", "in", "of", "to", "working", "works", "work", "citations", "citation", "index", "researcher", "builder", "engineer", "person", "profile"]);
  return input.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 1 && !/^\d+$/.test(term) && term !== "h" && !stop.has(term));
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
