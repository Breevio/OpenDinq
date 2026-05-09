import { artifactEvidence, cardEvidence, claimEvidence, dedupeEvidence } from "./evidence.js";
import { parseSearchQuery, tokenize } from "./query.js";
import type {
  MatchedSignals,
  ParsedSearchQuery,
  PersonSearchDocument,
  RankedSearchResult,
  SearchArtifact,
  SearchCard,
  SearchClaim,
  SearchPerson
} from "./types.js";

export const SEARCH_RANKING_WEIGHTS = {
  skillMatch: 0.35,
  artifactTextMatch: 0.25,
  impactSignal: 0.2,
  recency: 0.1,
  profileCompleteness: 0.1
} as const;

export function searchPeople(queryText: string, documents: PersonSearchDocument[]): RankedSearchResult[] {
  const parsedQuery = parseSearchQuery(queryText);

  return rankPeople(parsedQuery, documents)
    .filter((result) => result.score > 0 && result.evidence.length > 0)
    .sort((left, right) => right.score - left.score || left.person.handle.localeCompare(right.person.handle));
}

export function rankPeople(
  query: string | ParsedSearchQuery,
  documents: PersonSearchDocument[]
): RankedSearchResult[] {
  const parsedQuery = typeof query === "string" ? parseSearchQuery(query) : query;

  return documents.map((document) => {
    const matchedSignals = collectMatchedSignals(parsedQuery, document);
    const baseScore = scoreSignals(matchedSignals);
    const breakdown = scoreBreakdown(baseScore, matchedSignals, document);

    return {
      person: document.person,
      score: breakdown.finalScore,
      scoreBreakdown: breakdown,
      explanation: explainMatch(document.person, matchedSignals),
      evidence: matchedSignals.evidence
    };
  });
}

export function explainMatch(person: SearchPerson, matchedSignals: MatchedSignals): string {
  const reasons = [];

  if (matchedSignals.skillMatches.length > 0) {
    reasons.push(`matched ${joinReadable(matchedSignals.skillMatches)} from repository languages or topics`);
  }

  if (matchedSignals.artifactTextMatches.length > 0) {
    reasons.push(`matched artifact text for ${joinReadable(matchedSignals.artifactTextMatches)}`);
  }

  if (matchedSignals.impactSignal > 0) {
    reasons.push("has public impact signals from stars or forks");
  }

  if (matchedSignals.recencySignal > 0) {
    reasons.push("has recently updated artifacts");
  }

  if (reasons.length === 0) {
    return `${person.displayName} has no strong evidence match for this query.`;
  }

  return `${person.displayName} ${reasons.join(", ")}.`;
}

function collectMatchedSignals(query: ParsedSearchQuery, document: PersonSearchDocument): MatchedSignals {
  const skillMatches = new Set<string>();
  const artifactTextMatches = new Set<string>();
  const evidence: MatchedSignals["evidence"] = [];

  document.artifacts.forEach((artifact, index) => {
    const skills = artifactSkills(artifact);
    const artifactText = tokenize(`${artifact.title} ${artifact.description ?? ""}`).join(" ");

    for (const term of query.terms) {
      if (skills.some((skill) => normalizeSkill(skill).includes(term))) {
        skillMatches.add(formatMatchedTerm(term));
        evidence.push(artifactEvidence(artifact, `Matched skill signal "${term}".`, index));
      }

      if (artifactText.includes(term)) {
        artifactTextMatches.add(formatMatchedTerm(term));
        evidence.push(artifactEvidence(artifact, `Matched artifact text "${term}".`, index));
      }
    }

    for (const phrase of query.phrases) {
      if (artifactText.includes(phrase)) {
        artifactTextMatches.add(phrase);
        evidence.push(artifactEvidence(artifact, `Matched phrase "${phrase}".`, index));
      }
    }
  });

  visibleCards(document.cards).forEach((card, index) => {
    const cardText = tokenize(`${card.type} ${card.title} ${card.contentMd}`).join(" ");
    if (matchesQueryText(query, cardText)) {
      artifactTextMatches.add("card");
      evidence.push(cardEvidence(card, "Matched visible card content.", index));
      evidence.push(...(card.evidence ?? []));
    }
  });

  approvedClaims(document.claims).forEach((claim, index) => {
    const claimText = tokenize(`${claim.type} ${claim.text}`).join(" ");
    if (matchesQueryText(query, claimText)) {
      if (claim.type === "skill") {
        skillMatches.add(formatMatchedTerm(claim.text.toLowerCase()));
      } else {
        artifactTextMatches.add(formatMatchedTerm(claim.type.replace("_", " ")));
      }
      evidence.push(claimEvidence(claim, "Matched approved profile claim.", index));
      evidence.push(...(claim.evidence ?? []));
    }
  });

  return {
    skillMatches: [...skillMatches].sort(),
    artifactTextMatches: [...artifactTextMatches].sort(),
    impactSignal: calculateImpactSignal(document.artifacts),
    recencySignal: calculateRecencySignal(document.artifacts),
    profileCompleteness: calculateProfileCompleteness(document.person),
    evidence: dedupeEvidence(evidence)
  };
}

function scoreSignals(signals: MatchedSignals): number {
  const skillMatch = clamp(signals.skillMatches.length / 4);
  const artifactTextMatch = clamp(signals.artifactTextMatches.length / 4);

  const score =
    SEARCH_RANKING_WEIGHTS.skillMatch * skillMatch +
    SEARCH_RANKING_WEIGHTS.artifactTextMatch * artifactTextMatch +
    SEARCH_RANKING_WEIGHTS.impactSignal * signals.impactSignal +
    SEARCH_RANKING_WEIGHTS.recency * signals.recencySignal +
    SEARCH_RANKING_WEIGHTS.profileCompleteness * signals.profileCompleteness;

  return roundScore(score);
}

function scoreBreakdown(score: number, signals: MatchedSignals, document: PersonSearchDocument) {
  const evidence = dedupeEvidence(signals.evidence);
  const claimScore = clamp(evidence.filter((item) => item.type === "claim").length / 3);
  const cardScore = clamp(evidence.filter((item) => item.type === "card").length / 3);
  const artifactScore = clamp(evidence.filter((item) => item.type === "artifact").length / 4);
  const skillScore = clamp(signals.skillMatches.length / 4);
  const evidenceScore = clamp(evidence.length / 6);
  const publishBoost = document.person.publicStatus === "published" ? 0.04 : 0;
  const finalScore = roundScore(clamp(score + publishBoost));

  return {
    claimScore: roundScore(claimScore),
    cardScore: roundScore(cardScore),
    artifactScore: roundScore(artifactScore),
    skillScore: roundScore(skillScore),
    evidenceScore: roundScore(evidenceScore),
    publishBoost,
    recencyScore: roundScore(signals.recencySignal),
    finalScore
  };
}

function artifactSkills(artifact: SearchArtifact): string[] {
  return [stringMetadata(artifact, "language"), ...stringArrayMetadata(artifact, "topics")].filter(Boolean);
}

function calculateImpactSignal(artifacts: SearchArtifact[]): number {
  const maxImpact = Math.max(
    0,
    ...artifacts.map((artifact) => numberMetadata(artifact, "stars") + numberMetadata(artifact, "forks") * 2)
  );

  return clamp(Math.log10(maxImpact + 1) / 3);
}

function calculateRecencySignal(artifacts: SearchArtifact[]): number {
  const latestTimestamp = Math.max(
    0,
    ...artifacts.map((artifact) => Date.parse(stringMetadata(artifact, "updatedAt") || stringMetadata(artifact, "pushedAt")) || 0)
  );

  if (latestTimestamp === 0) {
    return 0;
  }

  const ageDays = (Date.now() - latestTimestamp) / 86_400_000;
  if (ageDays <= 90) {
    return 1;
  }

  if (ageDays <= 365) {
    return 0.6;
  }

  return 0.2;
}

function calculateProfileCompleteness(person: SearchPerson): number {
  const fields = [person.displayName, person.headline, person.bio, person.location];
  return fields.filter(Boolean).length / fields.length;
}

function numberMetadata(artifact: SearchArtifact, key: string): number {
  const value = artifact.metadata?.[key];
  return typeof value === "number" ? value : 0;
}

function stringMetadata(artifact: SearchArtifact, key: string): string {
  const value = artifact.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function stringArrayMetadata(artifact: SearchArtifact, key: string): string[] {
  const value = artifact.metadata?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function visibleCards(cards: SearchCard[] | undefined): SearchCard[] {
  return (cards ?? []).filter((card) => card.visibility !== "hidden");
}

function approvedClaims(claims: SearchClaim[] | undefined): SearchClaim[] {
  return (claims ?? []).filter((claim) => claim.status !== "rejected");
}

function matchesQueryText(query: ParsedSearchQuery, text: string): boolean {
  return query.terms.some((term) => text.includes(term)) || query.phrases.some((phrase) => text.includes(phrase));
}

function normalizeSkill(skill: string): string {
  return skill.toLowerCase().replace(/[-_\s]+/g, " ");
}

function formatMatchedTerm(term: string): string {
  if (term === "mcp") {
    return "MCP";
  }

  return term.charAt(0).toUpperCase() + term.slice(1);
}

function joinReadable(values: string[]): string {
  return values.length <= 2 ? values.join(" and ") : `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
