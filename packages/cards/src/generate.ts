import { buildEvidenceRefs } from "./evidence.js";
import type { CardArtifact, CardClaim, CardPerson, EvidenceRef, GeneratedCard } from "./types.js";

export function generateProfileCards(person: CardPerson, artifacts: CardArtifact[], claims: CardClaim[] = []): GeneratedCard[] {
  const usableClaims = qualityClaims(claims);
  const cards = [
    maybeSummaryCard(person, artifacts, usableClaims),
    maybeSkillCard(person, artifacts, usableClaims),
    maybeWorksCard(person, artifacts, usableClaims),
    maybeResearchCard(person, artifacts, usableClaims),
    maybeTimelineCard(person, artifacts, usableClaims),
    ...manualNoteCards(person, claims.filter((claim) => claim.status !== "rejected"))
  ].filter((card): card is GeneratedCard => Boolean(card));

  return cards.map((card) => ({
    ...card,
    id: card.id ?? `card-${person.handle}-${card.type}`,
    personId: card.personId ?? person.handle,
    visibility: "public" as const,
    order: card.order ?? defaultCardOrder(card.type),
  })).toSorted((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.type.localeCompare(right.type));
}

export function generateSummaryCard(person: CardPerson, artifacts: CardArtifact[]): GeneratedCard {
  const evidenceArtifacts = artifacts.slice(0, 5);
  assertHasEvidence(evidenceArtifacts, "summary card");

  return {
    type: "summary",
    title: `${person.displayName} summary`,
    contentMd: [
      `# ${person.displayName}`,
      person.headline ?? person.bio ?? "Public work profile generated from source artifacts.",
      summarizeArtifactCount(artifacts)
    ].join("\n\n"),
    dataJson: {
      handle: person.handle,
      artifactCount: artifacts.length
    },
    evidence: buildEvidenceRefs(evidenceArtifacts, "Artifact contributes to the profile summary.")
  };
}

export function generateGitHubCard(person: CardPerson, artifacts: CardArtifact[]): GeneratedCard {
  const repositories = topRepositories(artifacts);
  assertHasEvidence(repositories, "GitHub card");

  return {
    type: "github",
    title: `${person.displayName} GitHub work`,
    contentMd: [
      "## GitHub work",
      ...repositories.map((repo) => {
        const stars = numberMetadata(repo, "stars");
        const language = stringMetadata(repo, "language");
        const detail = [language, stars > 0 ? `${stars} stars` : undefined].filter(Boolean).join(", ");
        return `- ${repo.title}${detail ? ` (${detail})` : ""}`;
      })
    ].join("\n"),
    dataJson: {
      repositories: repositories.map((repo) => ({
        title: repo.title,
        url: repo.url,
        stars: numberMetadata(repo, "stars"),
        language: stringMetadata(repo, "language"),
        updatedAt: stringMetadata(repo, "updatedAt")
      }))
    },
    evidence: buildEvidenceRefs(repositories, "Repository is selected by stars and recency.")
  };
}

export function generateSkillsCard(person: CardPerson, artifacts: CardArtifact[]): GeneratedCard {
  const skills = extractSkills(artifacts);
  const evidenceArtifacts = artifacts.filter((artifact) => skills.some((skill) => artifactContainsSkill(artifact, skill)));
  assertHasEvidence(evidenceArtifacts, "skills card");

  return {
    type: "skills",
    title: `${person.displayName} skills`,
    contentMd: ["## Skills", ...skills.map((skill) => `- ${skill}`)].join("\n"),
    dataJson: {
      skills
    },
    evidence: buildEvidenceRefs(evidenceArtifacts, "Language, topic, title, or description supports this skill.")
  };
}

function maybeSummaryCard(person: CardPerson, artifacts: CardArtifact[], claims: CardClaim[]): GeneratedCard | undefined {
  const summaryClaims = claims.filter((claim) => claim.type === "summary" || claim.type === "role" || claim.type === "achievement").slice(0, 5);
  const evidence = evidenceFromClaims(summaryClaims).concat(buildEvidenceRefs(artifacts.slice(0, 3), "Artifact contributes to the profile summary."));
  if (evidence.length === 0) {
    return undefined;
  }
  const themes = topThemes(summaryClaims, artifacts);
  const bullets = summaryClaims.slice(0, 3).map((claim) => `- ${claim.text}`);
  const hasPublicEvidence = evidence.some(isPublicEvidence);

  return {
    type: "summary",
    title: `${person.displayName} profile`,
    contentMd: [
      `# ${person.displayName}`,
      person.headline ?? person.bio ?? (themes.join(", ") || (hasPublicEvidence ? "Evidence-backed public profile." : "Review profile generated from user-provided information.")),
      hasPublicEvidence && themes.length ? `Strongest evidence themes: ${themes.join(", ")}.` : undefined,
      ...bullets
    ].filter(Boolean).join("\n\n"),
    dataJson: {
      handle: person.handle,
      themes,
      ...qualityMetadata(summaryClaims, [], evidence)
    },
    evidence: dedupeEvidence(evidence),
    claimIds: claimIds(summaryClaims),
    confidence: averageConfidence(summaryClaims)
  };
}

function maybeSkillCard(person: CardPerson, artifacts: CardArtifact[], claims: CardClaim[]): GeneratedCard | undefined {
  const skillClaims = claims.filter((claim) => claim.type === "skill");
  const skillRows = skillClaims.length > 0 ? skillClaims.map((claim) => ({
    skill: claim.text,
    confidence: claim.confidence,
    evidenceCount: claim.evidence.length,
    sources: claim.evidence.map((item) => item.title),
    claim
  })) : extractSkills(artifacts).map((skill) => ({
    skill,
    confidence: 0.6,
    evidenceCount: artifacts.filter((artifact) => artifactContainsSkill(artifact, skill)).length,
    sources: artifacts.filter((artifact) => artifactContainsSkill(artifact, skill)).map((artifact) => artifact.title),
    claim: undefined
  }));
  const uniqueSkills = dedupeSkillRows(skillRows).slice(0, 12);
  const evidence = evidenceFromClaims(skillClaims);
  const fallbackEvidence = artifacts.filter((artifact) => uniqueSkills.some((row) => artifactContainsSkill(artifact, row.skill)));
  const allEvidence = dedupeEvidence(evidence.concat(buildEvidenceRefs(fallbackEvidence, "Artifact supports this skill.")));
  if (uniqueSkills.length === 0 || allEvidence.length === 0) {
    return undefined;
  }

  return {
    type: "skills",
    title: `${person.displayName} skills`,
    contentMd: [
      "## Skills",
      ...uniqueSkills.map((row) => {
        const evidenceLabel = row.sources.slice(0, 2).join(", ");
        return `- ${row.skill} (${Math.round(row.confidence * 100)}% confidence${evidenceLabel ? `, evidence: ${evidenceLabel}` : ""})`;
      })
    ].join("\n\n"),
    dataJson: {
      skills: uniqueSkills.map((row) => row.skill),
      groupedByEvidence: uniqueSkills.map((row) => ({
        skill: row.skill,
        confidence: row.confidence,
        evidenceCount: row.evidenceCount,
        sources: row.sources.slice(0, 3)
      })),
      ...qualityMetadata(skillClaims, [], allEvidence)
    },
    evidence: allEvidence,
    claimIds: claimIds(skillClaims),
    confidence: averageConfidence(skillClaims)
  };
}

function maybeWorksCard(person: CardPerson, artifacts: CardArtifact[], claims: CardClaim[]): GeneratedCard | undefined {
  const workClaims = claims.filter((claim) => ["project", "achievement", "link"].includes(claim.type));
  const works = artifacts
    .filter((artifact) => ["repo", "project", "post", "website"].includes(artifact.type))
    .toSorted((left, right) => scoreWorkArtifact(right, workClaims) - scoreWorkArtifact(left, workClaims) || left.title.localeCompare(right.title))
    .slice(0, 6);
  const evidence = dedupeEvidence(evidenceFromClaims(workClaims).concat(buildEvidenceRefs(works, "Artifact supports this work card.")));
  if (works.length === 0 || evidence.length === 0) {
    return undefined;
  }

  return {
    type: "works",
    title: `${person.displayName} works`,
    contentMd: ["## Selected works", ...works.map((artifact) => `- ${artifact.title}${artifact.description ? ` — ${artifact.description}` : ""}`)].join("\n"),
    dataJson: {
      works,
      rankedArtifacts: works.map((artifact) => ({ id: artifact.id, title: artifact.title, score: scoreWorkArtifact(artifact, workClaims) })),
      ...qualityMetadata(workClaims, works, evidence)
    },
    evidence,
    claimIds: claimIds(workClaims),
    confidence: averageConfidence(workClaims)
  };
}

function maybeResearchCard(person: CardPerson, artifacts: CardArtifact[], claims: CardClaim[]): GeneratedCard | undefined {
  const researchClaims = claims.filter((claim) => claim.type === "research_area");
  const papers = artifacts.filter(isResearchArtifact).slice(0, 6);
  const evidence = dedupeEvidence(evidenceFromClaims(researchClaims).concat(buildEvidenceRefs(papers, "Paper supports this research card.")));
  if (papers.length === 0 && researchClaims.length === 0) {
    return undefined;
  }
  if (evidence.length === 0) {
    return undefined;
  }

  return {
    type: "research",
    title: `${person.displayName} research`,
    contentMd: ["## Research", ...[...researchClaims.map((claim) => claim.text), ...papers.map((paper) => paper.title)].slice(0, 8).map((line) => `- ${line}`)].join("\n"),
    dataJson: { papers, ...qualityMetadata(researchClaims, papers, evidence) },
    evidence,
    claimIds: claimIds(researchClaims),
    confidence: averageConfidence(researchClaims)
  };
}

function maybeTimelineCard(person: CardPerson, artifacts: CardArtifact[], claims: CardClaim[]): GeneratedCard | undefined {
  const dated = artifacts
    .map((artifact) => ({ artifact, date: stringMetadata(artifact, "updatedAt") || stringMetadata(artifact, "publishedAt") || stringMetadata(artifact, "createdAt") }))
    .filter((item) => item.date)
    .toSorted((left, right) => right.date.localeCompare(left.date))
    .slice(0, 5);
  if (dated.length === 0) {
    return undefined;
  }

  return {
    type: "timeline",
    title: `${person.displayName} timeline`,
    contentMd: ["## Timeline", ...dated.map(({ artifact, date }) => `- ${date.slice(0, 10)} — ${artifact.title}`)].join("\n"),
    dataJson: {
      events: dated,
      ...qualityMetadata(claims.filter((claim) => claim.type === "achievement"), dated.map((item) => item.artifact), buildEvidenceRefs(dated.map((item) => item.artifact)))
    },
    evidence: buildEvidenceRefs(dated.map((item) => item.artifact), "Dated artifact supports this timeline event."),
    claimIds: claimIds(claims.filter((claim) => claim.type === "achievement")),
    confidence: averageConfidence(claims)
  };
}

function manualNoteCards(person: CardPerson, claims: CardClaim[]): GeneratedCard[] {
  return claims
    .filter((claim) => claim.type === "summary" && claim.evidence.some((item) => item.type === "source" && item.id === "manual"))
    .map((claim, index) => ({
      id: `card-${person.handle}-note-${index + 1}`,
      personId: person.handle,
      type: "note",
      title: `${person.displayName} note ${index + 1}`,
      contentMd: claim.text,
      dataJson: { source: "manual", ...qualityMetadata([claim], [], claim.evidence) },
      evidence: claim.evidence,
      claimIds: claimIds([claim]),
      confidence: claim.confidence,
      order: defaultCardOrder("note") + index
    }));
}

export interface SearchMatchInput {
  query: string;
  person: CardPerson;
  matchedClaims?: CardClaim[];
  evidenceSnippets?: EvidenceRef[];
  scoreBreakdown?: Record<string, number>;
  finalScore?: number;
}

export function generateSearchMatchCard(input: SearchMatchInput): GeneratedCard {
  const { query, person, matchedClaims = [], evidenceSnippets = [], scoreBreakdown = {}, finalScore } = input;
  const evidence = dedupeEvidence([...evidenceFromClaims(matchedClaims), ...evidenceSnippets]);

  const bullets: string[] = [];
  for (const claim of matchedClaims.slice(0, 4)) {
    bullets.push(`- ${claim.text}`);
  }
  if (evidenceSnippets.length > 0 && bullets.length === 0) {
    for (const snippet of evidenceSnippets.slice(0, 4)) {
      bullets.push(`- ${snippet.title}${snippet.url ? ` ([source](${snippet.url}))` : ""}`);
    }
  }
  if (bullets.length === 0) {
    bullets.push(`- Matched profile for "${query}"`);
  }

  const scoreSection = finalScore !== undefined
    ? `Match score: ${(finalScore * 100).toFixed(0)}%`
    : undefined;

  return {
    type: "search_match",
    title: `${person.displayName} — search match`,
    contentMd: [
      `# ${person.displayName}`,
      person.headline ?? `Matched "${query}"`,
      ...(scoreSection ? [scoreSection] : []),
      ...bullets
    ].join("\n\n"),
    dataJson: {
      query,
      handle: person.handle,
      finalScore,
      scoreBreakdown,
      matchedClaimCount: matchedClaims.length,
      evidenceCount: evidence.length,
      evidence
    },
    evidence,
    claimIds: claimIds(matchedClaims),
    confidence: finalScore,
    order: defaultCardOrder("search_match")
  };
}

function defaultCardOrder(type: GeneratedCard["type"]): number {
  const order: Record<GeneratedCard["type"], number> = {
    summary: 10,
    skills: 20,
    works: 30,
    github: 35,
    research: 40,
    timeline: 50,
    note: 60,
    search_match: 70
  };
  return order[type] ?? 100;
}

function summarizeArtifactCount(artifacts: CardArtifact[]): string {
  const repoCount = artifacts.filter((artifact) => artifact.type === "repo").length;
  return `Indexed ${artifacts.length} public artifacts${repoCount ? `, including ${repoCount} repositories` : ""}.`;
}

function assertHasEvidence(artifacts: CardArtifact[], cardName: string) {
  if (artifacts.length === 0) {
    throw new Error(`Cannot generate ${cardName} without evidence artifacts.`);
  }
}

function topRepositories(artifacts: CardArtifact[]): CardArtifact[] {
  return artifacts
    .filter((artifact) => artifact.type === "repo")
    .toSorted((left, right) => {
      const starDelta = numberMetadata(right, "stars") - numberMetadata(left, "stars");
      if (starDelta !== 0) {
        return starDelta;
      }

      return stringMetadata(right, "updatedAt").localeCompare(stringMetadata(left, "updatedAt"));
    })
    .slice(0, 5);
}

function extractSkills(artifacts: CardArtifact[]): string[] {
  const skills = new Set<string>();

  for (const artifact of artifacts) {
    const language = stringMetadata(artifact, "language");
    if (language) {
      skills.add(language);
    }

    for (const topic of stringArrayMetadata(artifact, "topics")) {
      skills.add(formatSkill(topic));
    }
  }

  return [...skills].filter(Boolean).sort((left, right) => left.localeCompare(right));
}

function artifactContainsSkill(artifact: CardArtifact, skill: string): boolean {
  const lowerSkill = skill.toLowerCase();
  const language = stringMetadata(artifact, "language").toLowerCase();
  const topics = stringArrayMetadata(artifact, "topics").map((topic) => formatSkill(topic).toLowerCase());
  const text = `${artifact.title} ${artifact.description ?? ""}`.toLowerCase();

  return language === lowerSkill || topics.includes(lowerSkill) || text.includes(lowerSkill);
}

function numberMetadata(artifact: CardArtifact, key: string): number {
  const value = artifact.metadata?.[key];
  return typeof value === "number" ? value : 0;
}

function stringMetadata(artifact: CardArtifact, key: string): string {
  const value = artifact.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function stringArrayMetadata(artifact: CardArtifact, key: string): string[] {
  const value = artifact.metadata?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function formatSkill(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(formatSkillPart)
    .join(" ");
}

function formatSkillPart(part: string): string {
  const acronyms: Record<string, string> = {
    ai: "AI",
    api: "API",
    cli: "CLI",
    css: "CSS",
    html: "HTML",
    llm: "LLM",
    mcp: "MCP",
    ml: "ML",
    sdk: "SDK",
    ui: "UI",
    ux: "UX"
  };
  const normalized = part.toLowerCase();
  return acronyms[normalized] ?? part.charAt(0).toUpperCase() + part.slice(1);
}

function evidenceFromClaims(claims: CardClaim[]): EvidenceRef[] {
  return claims.flatMap((claim) => claim.evidence.length > 0 ? claim.evidence : claim.id ? [{ id: claim.id, type: "claim", title: claim.text, reason: "Profile claim supports this card." } satisfies EvidenceRef] : []);
}

function claimIds(claims: CardClaim[]): string[] {
  return claims.map((claim) => claim.id).filter((id): id is string => Boolean(id));
}

function averageConfidence(claims: CardClaim[]): number | undefined {
  if (claims.length === 0) {
    return undefined;
  }

  return Math.round((claims.reduce((sum, claim) => sum + claim.confidence, 0) / claims.length) * 100) / 100;
}

function qualityClaims(claims: CardClaim[]): CardClaim[] {
  return claims
    .filter((claim) => claim.status !== "rejected")
    .filter((claim) => claim.evidence.length > 0)
    .toSorted((left, right) => (right.qualityScore ?? 0) - (left.qualityScore ?? 0) || right.confidence - left.confidence);
}

function qualityMetadata(claims: CardClaim[], artifacts: CardArtifact[], evidence: EvidenceRef[]): Record<string, unknown> {
  return {
    qualityScore: roundScore(
      Math.min(1, (averageConfidence(claims) ?? 0.65) * 0.45 + Math.min(1, evidence.length / 4) * 0.35 + Math.min(1, claims.length / 4) * 0.2)
    ),
    evidenceCount: dedupeEvidence(evidence).length,
    generatedFromClaimIds: claimIds(claims),
    generatedFromArtifactIds: artifacts.map((artifact) => artifact.id ?? artifact.url ?? artifact.title).filter(Boolean)
  };
}

function topThemes(claims: CardClaim[], artifacts: CardArtifact[]): string[] {
  const themes = new Set<string>();
  for (const claim of claims) {
    if (claim.type === "role" || claim.type === "research_area" || claim.type === "achievement") {
      themes.add(claim.text);
    }
  }
  for (const skill of extractSkills(artifacts).slice(0, 3)) {
    themes.add(skill);
  }
  return [...themes].slice(0, 3);
}

type SkillRow = {
  skill: string;
  confidence: number;
  evidenceCount: number;
  sources: string[];
  claim?: CardClaim;
};

function dedupeSkillRows(rows: SkillRow[]): SkillRow[] {
  const bySkill = new Map<string, SkillRow>();
  for (const row of rows) {
    const key = row.skill.toLowerCase();
    const existing = bySkill.get(key);
    if (!existing || row.confidence > existing.confidence || row.evidenceCount > existing.evidenceCount) {
      bySkill.set(key, row);
    }
  }
  return [...bySkill.values()].toSorted((left, right) => right.confidence - left.confidence || right.evidenceCount - left.evidenceCount || left.skill.localeCompare(right.skill));
}

function scoreWorkArtifact(artifact: CardArtifact, claims: CardClaim[]): number {
  const linkedClaims = claims.filter((claim) => claim.artifactId && (claim.artifactId === artifact.id || claim.artifactId === artifact.url));
  const evidenceRelevance = claims.some((claim) => claim.evidence.some((item) => item.id === artifact.id || item.id === artifact.url || item.title === artifact.title)) ? 0.3 : 0;
  const impact = Math.min(0.25, Math.log10(numberMetadata(artifact, "stars") + numberMetadata(artifact, "forks") * 2 + 1) / 12);
  const recency = artifactRecencyScore(artifact) * 0.15;
  const linkage = Math.min(0.2, linkedClaims.length * 0.1);
  const manual = numberMetadata(artifact, "manualImportance") * 0.1;
  return roundScore(evidenceRelevance + impact + recency + linkage + manual);
}

function artifactRecencyScore(artifact: CardArtifact): number {
  const timestamp = Date.parse(stringMetadata(artifact, "updatedAt") || stringMetadata(artifact, "pushedAt") || stringMetadata(artifact, "publishedAt"));
  if (!timestamp) {
    return 0;
  }
  const ageDays = (Date.now() - timestamp) / 86_400_000;
  return ageDays <= 120 ? 1 : ageDays <= 730 ? 0.5 : 0.15;
}

function isResearchArtifact(artifact: CardArtifact): boolean {
  if (artifact.type === "paper") {
    return true;
  }
  const text = `${artifact.title} ${artifact.description ?? ""} ${stringArrayMetadata(artifact, "topics").join(" ")}`.toLowerCase();
  return /\b(paper|research|arxiv|publication|evaluation|benchmark)\b/.test(text);
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isPublicEvidence(evidence: EvidenceRef): boolean {
  const reason = evidence.reason.toLowerCase();
  return !reason.includes("user-provided") && !reason.includes("add public evidence");
}

function dedupeEvidence(evidence: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.type}:${item.id}:${item.reason}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
