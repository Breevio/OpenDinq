import type { PersonSearchDocument, SearchFacet, SearchFilters } from "./types.js";

export function applySearchFilters(
  results: Array<{ person: PersonSearchDocument["person"]; score: number; evidence?: unknown[]; topSkills?: string[]; matchedArtifacts?: Array<{ type?: string }>; } & Record<string, unknown>>,
  filters: SearchFilters
): typeof results {
  if (!hasActiveFilters(filters)) {
    return results;
  }

  return results.filter((result) => matchesFilters(result, filters));
}

export function collectFacets(documents: PersonSearchDocument[]): SearchFacet[] {
  const skillCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  const sourceTypeCounts = new Map<string, number>();

  for (const document of documents) {
    if (document.person.location) {
      locationCounts.set(document.person.location, (locationCounts.get(document.person.location) ?? 0) + 1);
    }

    const skills = collectDocumentSkills(document);
    for (const skill of skills) {
      skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1);
    }

    const sourceTypes = collectDocumentSourceTypes(document);
    for (const sourceType of sourceTypes) {
      sourceTypeCounts.set(sourceType, (sourceTypeCounts.get(sourceType) ?? 0) + 1);
    }
  }

  return [
    {
      field: "skill",
      label: "Skills",
      values: [...skillCounts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
        .slice(0, 15)
    },
    {
      field: "location",
      label: "Location",
      values: [...locationCounts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
        .slice(0, 10)
    },
    {
      field: "sourceType",
      label: "Source",
      values: [...sourceTypeCounts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
        .slice(0, 10)
    }
  ];
}

function hasActiveFilters(filters: SearchFilters): boolean {
  return Boolean(
    filters.skills?.length ||
    filters.locations?.length ||
    filters.sourceTypes?.length ||
    filters.minScore !== undefined ||
    filters.minArtifacts !== undefined
  );
}

function matchesFilters(result: SearchFilterableResult, filters: SearchFilters): boolean {
  if (filters.skills?.length && !filters.skills.some((skill) => result.topSkills?.includes(skill))) {
    return false;
  }

  if (filters.locations?.length && !filters.locations.includes(result.person.location ?? "")) {
    return false;
  }

  if (filters.sourceTypes?.length) {
    const resultSourceTypes = collectResultSourceTypes(result);
    if (!filters.sourceTypes.some((sourceType) => resultSourceTypes.includes(sourceType))) {
      return false;
    }
  }

  if (filters.minScore !== undefined && result.score < filters.minScore) {
    return false;
  }

  if (filters.minArtifacts !== undefined && (result.matchedArtifacts?.length ?? 0) < filters.minArtifacts) {
    return false;
  }

  return true;
}

type SearchFilterableResult = {
  person: PersonSearchDocument["person"];
  score: number;
  topSkills?: string[];
  matchedArtifacts?: Array<{ type?: string }>;
};

function collectDocumentSkills(document: PersonSearchDocument): string[] {
  const skills = new Set<string>();
  for (const claim of document.claims ?? []) {
    if (claim.type === "skill") {
      skills.add(claim.text);
    }
  }
  for (const card of document.cards ?? []) {
    const cardSkills = card.dataJson?.skills;
    if (Array.isArray(cardSkills)) {
      for (const skill of cardSkills) {
        if (typeof skill === "string") {
          skills.add(skill);
        }
      }
    }
  }
  for (const artifact of document.artifacts) {
    const language = artifact.metadata?.language;
    if (typeof language === "string") {
      skills.add(language);
    }
    const topics = artifact.metadata?.topics;
    if (Array.isArray(topics)) {
      for (const topic of topics) {
        if (typeof topic === "string") {
          skills.add(formatSkill(topic));
        }
      }
    }
  }
  return [...skills];
}

function collectDocumentSourceTypes(document: PersonSearchDocument): string[] {
  const sourceTypes = new Set<string>();
  for (const artifact of document.artifacts) {
    sourceTypes.add(artifact.type);
  }
  return [...sourceTypes];
}

function collectResultSourceTypes(result: SearchFilterableResult): string[] {
  const sourceTypes = new Set<string>();
  for (const artifact of result.matchedArtifacts ?? []) {
    if (artifact.type) {
      sourceTypes.add(artifact.type);
    }
  }
  return [...sourceTypes];
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
