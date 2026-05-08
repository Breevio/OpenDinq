import { buildEvidenceRefs } from "./evidence.js";
import type { CardArtifact, CardClaim, CardPerson, EvidenceRef, GeneratedCard } from "./types.js";

export function generateProfileCards(person: CardPerson, artifacts: CardArtifact[], claims: CardClaim[] = []): GeneratedCard[] {
  const cards = [
    maybeSummaryCard(person, artifacts, claims),
    maybeSkillCard(person, artifacts, claims),
    maybeWorksCard(person, artifacts, claims),
    maybeResearchCard(person, artifacts, claims),
    maybeTimelineCard(person, artifacts, claims),
    ...manualNoteCards(person, claims)
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
  const summaryClaims = claims.filter((claim) => claim.type === "summary" || claim.type === "role" || claim.type === "achievement");
  const evidence = evidenceFromClaims(summaryClaims).concat(buildEvidenceRefs(artifacts.slice(0, 3), "Artifact contributes to the profile summary."));
  if (evidence.length === 0) {
    return undefined;
  }

  return {
    type: "summary",
    title: `${person.displayName} profile`,
    contentMd: [
      `# ${person.displayName}`,
      person.headline ?? person.bio ?? "Evidence-backed public profile.",
      ...summaryClaims.slice(0, 4).map((claim) => `- ${claim.text}`)
    ].join("\n\n"),
    dataJson: { handle: person.handle },
    evidence: dedupeEvidence(evidence),
    claimIds: claimIds(summaryClaims),
    confidence: averageConfidence(summaryClaims)
  };
}

function maybeSkillCard(person: CardPerson, artifacts: CardArtifact[], claims: CardClaim[]): GeneratedCard | undefined {
  const skillClaims = claims.filter((claim) => claim.type === "skill");
  const skills = skillClaims.length > 0 ? skillClaims.map((claim) => claim.text) : extractSkills(artifacts);
  const evidence = evidenceFromClaims(skillClaims);
  const fallbackEvidence = artifacts.filter((artifact) => skills.some((skill) => artifactContainsSkill(artifact, skill)));
  const allEvidence = dedupeEvidence(evidence.concat(buildEvidenceRefs(fallbackEvidence, "Artifact supports this skill.")));
  if (skills.length === 0 || allEvidence.length === 0) {
    return undefined;
  }

  return {
    type: "skills",
    title: `${person.displayName} skills`,
    contentMd: ["## Skills", ...[...new Set(skills)].slice(0, 12).map((skill) => `- ${skill}`)].join("\n"),
    dataJson: { skills: [...new Set(skills)].slice(0, 12) },
    evidence: allEvidence,
    claimIds: claimIds(skillClaims),
    confidence: averageConfidence(skillClaims)
  };
}

function maybeWorksCard(person: CardPerson, artifacts: CardArtifact[], claims: CardClaim[]): GeneratedCard | undefined {
  const workClaims = claims.filter((claim) => ["project", "achievement", "link"].includes(claim.type));
  const works = artifacts.filter((artifact) => ["repo", "project", "post", "website"].includes(artifact.type)).slice(0, 6);
  const evidence = dedupeEvidence(evidenceFromClaims(workClaims).concat(buildEvidenceRefs(works, "Artifact supports this work card.")));
  if (works.length === 0 || evidence.length === 0) {
    return undefined;
  }

  return {
    type: "works",
    title: `${person.displayName} works`,
    contentMd: ["## Selected works", ...works.map((artifact) => `- ${artifact.title}${artifact.description ? ` — ${artifact.description}` : ""}`)].join("\n"),
    dataJson: { works },
    evidence,
    claimIds: claimIds(workClaims),
    confidence: averageConfidence(workClaims)
  };
}

function maybeResearchCard(person: CardPerson, artifacts: CardArtifact[], claims: CardClaim[]): GeneratedCard | undefined {
  const researchClaims = claims.filter((claim) => claim.type === "research_area");
  const papers = artifacts.filter((artifact) => artifact.type === "paper").slice(0, 6);
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
    dataJson: { papers },
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
    dataJson: { events: dated },
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
      evidence: claim.evidence,
      claimIds: claimIds([claim]),
      confidence: claim.confidence,
      order: defaultCardOrder("note") + index
    }));
}

function defaultCardOrder(type: GeneratedCard["type"]): number {
  const order: Record<GeneratedCard["type"], number> = {
    summary: 10,
    skills: 20,
    works: 30,
    github: 35,
    research: 40,
    timeline: 50,
    note: 60
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
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
