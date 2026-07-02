import type { CardArtifact, CardClaim, CardPerson, EvidenceRef } from "./types.js";

export type TalentSignal = {
  field: "ai_talent" | "career_momentum" | "digital_identity";
  label: string;
  value: string;
  confidence: number;
  evidence: EvidenceRef[];
  description: string;
};

export type CandidateInsights = {
  signals: TalentSignal[];
  overallScore: number;
  summary: string;
};

const AI_TALENT_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "machine learning",
  "ml",
  "deep learning",
  "neural",
  "llm",
  "language model",
  "transformer",
  "nlp",
  "computer vision",
  "reinforcement learning",
  "rag",
  "agent",
  "agents",
  "mcp",
  "model",
  "inference",
  "training",
  "fine-tuning",
  "embedding",
  "vector",
  "prompt"
];

const MOMENTUM_KEYWORDS = [
  "shipping",
  "launched",
  "released",
  "new",
  "recent",
  "latest",
  "2024",
  "2025",
  "2026",
  "active",
  "maintainer",
  "contributor"
];

export function generateCandidateInsights(
  person: CardPerson,
  artifacts: CardArtifact[],
  claims: CardClaim[] = []
): CandidateInsights {
  const signals: TalentSignal[] = [];

  const aiSignal = assessAiTalentSignal(artifacts, claims);
  if (aiSignal) {
    signals.push(aiSignal);
  }

  const momentumSignal = assessCareerMomentumSignal(person, artifacts, claims);
  if (momentumSignal) {
    signals.push(momentumSignal);
  }

  const identitySignal = assessDigitalIdentitySignal(person, artifacts, claims);
  if (identitySignal) {
    signals.push(identitySignal);
  }

  const overallScore = calculateOverallScore(signals);
  const summary = buildInsightsSummary(signals, overallScore);

  return {
    signals,
    overallScore,
    summary
  };
}

function assessAiTalentSignal(artifacts: CardArtifact[], claims: CardClaim[]): TalentSignal | undefined {
  const evidence: EvidenceRef[] = [];
  let matchCount = 0;

  for (const artifact of artifacts) {
    const text = `${artifact.title} ${artifact.description ?? ""}`.toLowerCase();
    const topics = artifact.metadata?.topics;
    const topicList = Array.isArray(topics) ? topics.filter((t): t is string => typeof t === "string") : [];

    const allText = `${text} ${topicList.join(" ")}`;
    if (AI_TALENT_KEYWORDS.some((keyword) => allText.includes(keyword))) {
      matchCount++;
      evidence.push({
        id: artifact.id ?? artifact.url ?? artifact.title,
        type: "artifact",
        title: artifact.title,
        url: artifact.url,
        reason: "Artifact demonstrates AI/ML work"
      });
    }
  }

  for (const claim of claims) {
    const text = `${claim.type} ${claim.text}`.toLowerCase();
    if (AI_TALENT_KEYWORDS.some((keyword) => text.includes(keyword))) {
      matchCount++;
      evidence.push(...claim.evidence);
    }
  }

  if (matchCount === 0) {
    return undefined;
  }

  const confidence = Math.min(0.95, 0.5 + matchCount * 0.15);
  const level = matchCount >= 3 ? "Strong" : matchCount >= 2 ? "Moderate" : "Emerging";

  return {
    field: "ai_talent",
    label: "AI Talent Signals",
    value: `${level} (${matchCount} signal${matchCount === 1 ? "" : "s"})`,
    confidence,
    evidence: dedupeEvidence(evidence),
    description: `${matchCount} AI-related signal${matchCount === 1 ? "" : "s"} detected from artifacts and claims.`
  };
}

function assessCareerMomentumSignal(
  person: CardPerson,
  artifacts: CardArtifact[],
  claims: CardClaim[]
): TalentSignal | undefined {
  const now = Date.now();
  const recentArtifacts = artifacts.filter((artifact) => {
    const updated = artifact.metadata?.updatedAt ?? artifact.metadata?.pushedAt;
    if (typeof updated !== "string") {
      return false;
    }
    const timestamp = Date.parse(updated);
    if (!Number.isFinite(timestamp)) {
      return false;
    }
    const ageDays = (now - timestamp) / 86_400_000;
    return ageDays <= 365;
  });

  const totalStars = artifacts.reduce((sum, artifact) => {
    const stars = artifact.metadata?.stars;
    return sum + (typeof stars === "number" ? stars : 0);
  }, 0);

  const hasMomentumKeywords = claims.some((claim) => {
    const text = claim.text.toLowerCase();
    return MOMENTUM_KEYWORDS.some((keyword) => text.includes(keyword));
  });

  if (recentArtifacts.length === 0 && totalStars === 0 && !hasMomentumKeywords) {
    return undefined;
  }

  const evidence: EvidenceRef[] = recentArtifacts.slice(0, 5).map((artifact) => ({
    id: artifact.id ?? artifact.url ?? artifact.title,
    type: "artifact",
    title: artifact.title,
    url: artifact.url,
    reason: "Recently active artifact"
  }));

  const momentumScore = Math.min(
    1,
    recentArtifacts.length * 0.3 + Math.log10(totalStars + 1) / 3 + (hasMomentumKeywords ? 0.2 : 0)
  );

  const level = momentumScore >= 0.7 ? "High" : momentumScore >= 0.4 ? "Medium" : "Building";

  return {
    field: "career_momentum",
    label: "Career Momentum",
    value: `${level} (${recentArtifacts.length} recent, ${totalStars} stars)`,
    confidence: momentumScore,
    evidence: dedupeEvidence(evidence),
    description: `${recentArtifacts.length} recently active artifact${recentArtifacts.length === 1 ? "" : "s"} with ${totalStars} total stars.`
  };
}

function assessDigitalIdentitySignal(
  person: CardPerson,
  artifacts: CardArtifact[],
  claims: CardClaim[]
): TalentSignal | undefined {
  const sources = new Set<string>();
  const evidence: EvidenceRef[] = [];

  for (const artifact of artifacts) {
    if (artifact.type === "repo") {
      sources.add("github");
      evidence.push({
        id: artifact.id ?? artifact.url ?? artifact.title,
        type: "artifact",
        title: artifact.title,
        url: artifact.url,
        reason: "GitHub repository contributes to digital identity"
      });
    }
    if (artifact.type === "paper") {
      sources.add("academic");
      evidence.push({
        id: artifact.id ?? artifact.url ?? artifact.title,
        type: "artifact",
        title: artifact.title,
        url: artifact.url,
        reason: "Academic publication contributes to digital identity"
      });
    }
    if (artifact.type === "website" || artifact.type === "post") {
      sources.add("web");
      evidence.push({
        id: artifact.id ?? artifact.url ?? artifact.title,
        type: "artifact",
        title: artifact.title,
        url: artifact.url,
        reason: "Web presence contributes to digital identity"
      });
    }
  }

  if (sources.size === 0) {
    return undefined;
  }

  const confidence = Math.min(0.9, 0.4 + sources.size * 0.2);
  const level = sources.size >= 3 ? "Rich" : sources.size >= 2 ? "Established" : "Emerging";

  return {
    field: "digital_identity",
    label: "Digital Identity",
    value: `${level} (${sources.size} source type${sources.size === 1 ? "" : "s"})`,
    confidence,
    evidence: dedupeEvidence(evidence),
    description: `${sources.size} distinct source type${sources.size === 1 ? "" : "s"} contribute to digital identity.`
  };
}

function calculateOverallScore(signals: TalentSignal[]): number {
  if (signals.length === 0) {
    return 0;
  }
  const total = signals.reduce((sum, signal) => sum + signal.confidence, 0);
  return Math.round((total / signals.length) * 100) / 100;
}

function buildInsightsSummary(signals: TalentSignal[], overallScore: number): string {
  if (signals.length === 0) {
    return "No candidate insights available.";
  }
  const signalLabels = signals.map((s) => s.label).join(", ");
  return `Candidate insights: ${signalLabels}. Overall insight score: ${(overallScore * 100).toFixed(0)}%.`;
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
