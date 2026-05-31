import type { EvidenceRecord, ProfileClaimRecord } from "./store.js";

const SUPPORTED_TYPES = new Set<ProfileClaimRecord["type"]>([
  "skill",
  "role",
  "project",
  "research_area",
  "achievement",
  "affiliation",
  "link",
  "summary"
]);

const GENERIC_PATTERNS = [
  /^developer$/i,
  /^engineer$/i,
  /^software engineer$/i,
  /^builder$/i,
  /^researcher$/i,
  /^works on software$/i,
  /^public profile$/i,
  /^profile summary$/i
];

export type ClaimQualityContext = {
  manualSourceIds?: string[];
};

export function normalizeClaims(
  claims: ProfileClaimRecord[],
  context: ClaimQualityContext = {}
): ProfileClaimRecord[] {
  const normalized = claims
    .map((claim) => normalizeClaim(claim, context))
    .filter((claim): claim is ProfileClaimRecord => Boolean(claim));

  return rankClaims(dedupeClaims(normalized));
}

export function rankClaims(claims: ProfileClaimRecord[]): ProfileClaimRecord[] {
  return claims
    .map((claim) => ({ ...claim, qualityScore: scoreClaimQuality(claim) }))
    .toSorted((left, right) => {
      const statusDelta = statusRank(right) - statusRank(left);
      if (statusDelta !== 0) {
        return statusDelta;
      }
      return (right.qualityScore ?? 0) - (left.qualityScore ?? 0) || right.confidence - left.confidence || left.text.localeCompare(right.text);
    });
}

export function publicRankedClaims(claims: ProfileClaimRecord[]): ProfileClaimRecord[] {
  return rankClaims(claims.filter((claim) => claim.status === "approved"));
}

export function scoreClaimQuality(claim: ProfileClaimRecord): number {
  const evidenceCount = Math.min(1, dedupeEvidence(claim.evidence).length / 3);
  const sourceQuality = Math.max(0, ...claim.evidence.map(evidenceSourceQuality));
  const artifactQuality = Math.max(0, ...claim.evidence.map(evidenceArtifactQuality));
  const confidence = clamp(claim.confidence);
  const specificity = claimSpecificity(claim.text);
  const genericPenalty = isGenericClaim(claim.text) ? 0.25 : 0;
  const manualBoost = isManualClaim(claim) ? 0.08 : 0;

  return roundScore(
    clamp(
      evidenceCount * 0.22 +
        sourceQuality * 0.18 +
        artifactQuality * 0.12 +
        confidence * 0.2 +
        specificity * 0.2 +
        manualBoost -
        genericPenalty
    )
  );
}

function normalizeClaim(claim: ProfileClaimRecord, context: ClaimQualityContext): ProfileClaimRecord | undefined {
  const text = normalizeClaimText(claim.text);
  const type = normalizeClaimType(claim.type);
  const evidence = normalizeEvidence(claim.evidence);
  if (!text || !type || evidence.length === 0) {
    return undefined;
  }

  const normalized: ProfileClaimRecord = {
    ...claim,
    type,
    text,
    confidence: normalizeConfidence(claim.confidence),
    evidence,
    status: claim.status ?? "approved"
  };
  normalized.qualityScore = scoreClaimQuality({
    ...normalized,
    sourceId: normalized.sourceId ?? context.manualSourceIds?.find((id) => normalized.evidence.some((item) => item.id === id))
  });
  return normalized;
}

function normalizeClaimText(text: string): string {
  return text.trim().replace(/\s+/g, " ").replace(/[.。]+$/g, "");
}

function normalizeClaimType(type: string): ProfileClaimRecord["type"] | undefined {
  const normalized = type.trim().toLowerCase().replace(/[-\s]+/g, "_");
  return SUPPORTED_TYPES.has(normalized as ProfileClaimRecord["type"]) ? normalized as ProfileClaimRecord["type"] : undefined;
}

function normalizeConfidence(confidence: number): number {
  return roundScore(clamp(Number.isFinite(confidence) ? confidence : 0.5));
}

function normalizeEvidence(evidence: EvidenceRecord[]): EvidenceRecord[] {
  return dedupeEvidence(
    evidence
      .map((item) => ({
        ...item,
        id: item.id?.trim(),
        title: item.title?.trim(),
        reason: item.reason?.trim() || "Evidence supports this claim."
      }))
      .filter((item): item is EvidenceRecord => Boolean(item.id && item.title && item.reason && isSupportedEvidenceType(item.type)))
  );
}

function dedupeClaims(claims: ProfileClaimRecord[]): ProfileClaimRecord[] {
  const byKey = new Map<string, ProfileClaimRecord>();

  for (const claim of claims) {
    const keys = claimKeys(claim);
    const existingKey = keys.find((key) => byKey.has(key));
    if (!existingKey) {
      for (const key of keys) {
        byKey.set(key, claim);
      }
      continue;
    }

    const existing = byKey.get(existingKey);
    if (!existing) {
      continue;
    }
    const merged = mergeClaims(existing, claim);
    for (const key of claimKeys(existing).concat(keys)) {
      byKey.set(key, merged);
    }
  }

  return [...new Set(byKey.values())].map((claim) => ({ ...claim, qualityScore: scoreClaimQuality(claim) }));
}

function claimKeys(claim: ProfileClaimRecord): string[] {
  const text = comparableText(claim.text);
  const evidenceIds = dedupeEvidence(claim.evidence).map((item) => `${item.type}:${item.id}`).sort().join("|");
  return [
    `${claim.type}:exact:${claim.text}`,
    `${claim.type}:ci:${text}`,
    evidenceIds ? `${claim.type}:evidence:${evidenceIds}` : ""
  ].filter(Boolean);
}

function mergeClaims(left: ProfileClaimRecord, right: ProfileClaimRecord): ProfileClaimRecord {
  const preferred = right.confidence > left.confidence ? right : left;
  const other = preferred === right ? left : right;
  return {
    ...preferred,
    evidence: dedupeEvidence([...preferred.evidence, ...other.evidence]),
    confidence: Math.max(preferred.confidence, other.confidence),
    status: preferred.status === "approved" || other.status === "approved" ? "approved" : preferred.status ?? other.status,
    qualityScore: undefined
  };
}

function dedupeEvidence(evidence: EvidenceRecord[]): EvidenceRecord[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function statusRank(claim: ProfileClaimRecord): number {
  if (claim.status === "approved") {
    return 3;
  }
  if (claim.status === "pending" || !claim.status) {
    return 2;
  }
  return 1;
}

function evidenceSourceQuality(evidence: EvidenceRecord): number {
  if (evidence.type === "artifact") {
    return 0.9;
  }
  if (evidence.type === "source") {
    return evidence.id === "manual" ? 0.75 : 0.8;
  }
  if (evidence.type === "claim") {
    return 0.45;
  }
  return 0.6;
}

function evidenceArtifactQuality(evidence: EvidenceRecord): number {
  const text = `${evidence.title} ${evidence.url ?? ""}`.toLowerCase();
  if (evidence.type !== "artifact") {
    return 0;
  }
  if (text.includes("github.com") || text.includes("arxiv") || text.includes("openalex") || text.includes("orcid")) {
    return 1;
  }
  return 0.65;
}

function claimSpecificity(text: string): number {
  const tokens = text.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean);
  const hasNamedToken = /[A-Z][a-z0-9]+|[A-Z]{2,}|[+#.]/.test(text);
  const lengthScore = Math.min(1, Math.max(0.2, tokens.length / 8));
  return clamp(lengthScore + (hasNamedToken ? 0.18 : 0));
}

function isGenericClaim(text: string): boolean {
  return GENERIC_PATTERNS.some((pattern) => pattern.test(text.trim())) || text.trim().split(/\s+/).length <= 1;
}

function isManualClaim(claim: ProfileClaimRecord): boolean {
  return claim.sourceId?.startsWith("manual-") || claim.evidence.some((item) => item.type === "source" && item.id === "manual");
}

function comparableText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
}

function isSupportedEvidenceType(type: EvidenceRecord["type"]): boolean {
  return type === "artifact" || type === "claim" || type === "source" || type === "external";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
