export const CARD_TYPES = ["summary", "github", "skills", "trajectory", "note"] as const;

export { buildEvidenceRefs } from "./evidence.js";
export { generateGitHubCard, generateSkillsCard, generateSummaryCard } from "./generate.js";
export type { CardArtifact, CardPerson, EvidenceRef, GeneratedCard } from "./types.js";
