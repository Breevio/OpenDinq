import { generateGitHubCard, generateSkillsCard, generateSummaryCard } from "@opendinq/cards";
import type { PersonProfileRecord } from "@opendinq/core";
import type { SearchArtifact, SearchPerson } from "@opendinq/search";

type DemoProfileInput = {
  person: SearchPerson;
  artifacts: SearchArtifact[];
};

const demoProfiles: DemoProfileInput[] = [
  {
    person: {
      handle: "demo-agent-builder",
      displayName: "Demo Agent Builder",
      headline: "AI agent engineer building MCP tools",
      bio: "Builds TypeScript automation, model tooling, and evidence-backed developer workflows.",
      location: "Remote"
    },
    artifacts: [
      repo("demo-agent-builder/agent-tools", "TypeScript tools for AI agents and MCP workflows", "TypeScript", [
        "ai-agents",
        "mcp",
        "automation"
      ], 320, 24, "2026-04-28T12:00:00Z"),
      repo("demo-agent-builder/profile-index", "Evidence-backed profile indexing experiments", "Python", [
        "profiles",
        "search",
        "rag"
      ], 87, 7, "2026-02-10T12:00:00Z")
    ]
  },
  {
    person: {
      handle: "demo-systems-maintainer",
      displayName: "Demo Systems Maintainer",
      headline: "Rust systems engineer maintaining open-source runtimes",
      bio: "Works on low-level tooling, async runtimes, and performance-sensitive infrastructure.",
      location: "Berlin"
    },
    artifacts: [
      repo("demo-systems-maintainer/runtime-kit", "Rust async runtime utilities for systems programming", "Rust", [
        "systems",
        "runtime",
        "async"
      ], 540, 61, "2026-03-18T12:00:00Z"),
      repo("demo-systems-maintainer/wasm-edge-tools", "WebAssembly edge runtime diagnostics", "Rust", [
        "wasm",
        "observability",
        "systems"
      ], 210, 19, "2025-12-05T12:00:00Z")
    ]
  },
  {
    person: {
      handle: "demo-ml-researcher",
      displayName: "Demo ML Researcher",
      headline: "Machine learning researcher shipping Python projects",
      bio: "Publishes practical ML experiments around retrieval, evaluation, and applied model systems.",
      location: "San Francisco"
    },
    artifacts: [
      repo("demo-ml-researcher/retrieval-eval", "Python evaluation toolkit for retrieval and ranking models", "Python", [
        "machine-learning",
        "evaluation",
        "retrieval"
      ], 410, 33, "2026-04-05T12:00:00Z"),
      repo("demo-ml-researcher/paper-tracker", "Research artifact tracker for papers, code, and impact signals", "TypeScript", [
        "papers",
        "research",
        "profiles"
      ], 96, 8, "2026-01-20T12:00:00Z")
    ]
  }
];

export function createDemoProfiles(): PersonProfileRecord[] {
  return demoProfiles.map(({ person, artifacts }) => ({
    person,
    sources: [
      {
        type: "github",
        url: `https://github.com/${person.handle}`,
        externalId: person.handle
      }
    ],
    artifacts,
    cards: [
      generateSummaryCard(person, artifacts),
      generateGitHubCard(person, artifacts),
      generateSkillsCard(person, artifacts)
    ]
  }));
}

function repo(
  title: string,
  description: string,
  language: string,
  topics: string[],
  stars: number,
  forks: number,
  updatedAt: string
): SearchArtifact {
  return {
    type: "repo",
    title,
    description,
    url: `https://github.com/${title}`,
    metadata: {
      language,
      topics,
      stars,
      forks,
      pushedAt: updatedAt,
      updatedAt
    }
  };
}
