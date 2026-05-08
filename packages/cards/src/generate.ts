import { buildEvidenceRefs } from "./evidence.js";
import type { CardArtifact, CardPerson, GeneratedCard } from "./types.js";

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
