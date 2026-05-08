export const CARD_TYPES = ["summary", "skills", "works", "research", "timeline", "note", "github"] as const;

export { buildEvidenceRefs } from "./evidence.js";
export { generateGitHubCard, generateProfileCards, generateSkillsCard, generateSummaryCard } from "./generate.js";
export type { CardArtifact, CardClaim, CardPerson, EvidenceRef, GeneratedCard } from "./types.js";
