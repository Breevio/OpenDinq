import { generateProfileCards } from "@opendinq/cards";
import { normalizeClaims, type PersonProfileRecord, type ProfileClaimRecord } from "@opendinq/core";
import type { SearchArtifact, SearchPerson } from "@opendinq/search";

type DemoProfileInput = {
  person: SearchPerson;
  artifacts: SearchArtifact[];
  claims: ProfileClaimRecord[];
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
    ],
    claims: [
      demoClaim("skill", "TypeScript MCP agent workflows", "demo-agent-builder/agent-tools", 0.9),
      demoClaim("project", "Builds evidence-backed profile automation for AI agents", "demo-agent-builder/profile-index", 0.84)
    ]
  },
  {
    person: {
      handle: "demo-product-designer",
      displayName: "Demo Product Designer",
      headline: "Product designer focused on startup onboarding",
      bio: "Designs activation flows, evidence-backed profile cards, and low-friction workspace experiences.",
      location: "New York"
    },
    artifacts: [
      project("startup-onboarding-system", "Onboarding design system for startup activation and profile setup", ["product-design", "onboarding", "startup"], 0.9, "2026-04-12T12:00:00Z"),
      project("profile-card-studio", "Card curation prototypes for evidence-backed public profiles", ["cards", "ux-research", "profiles"], 0.82, "2026-02-22T12:00:00Z")
    ],
    claims: [
      demoClaim("skill", "Startup product design onboarding", "startup-onboarding-system", 0.9),
      demoClaim("achievement", "Designed profile card curation flows backed by user evidence", "profile-card-studio", 0.82)
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
    ],
    claims: [
      demoClaim("skill", "Rust open-source systems maintenance", "demo-systems-maintainer/runtime-kit", 0.91),
      demoClaim("project", "Maintains runtime diagnostics for WebAssembly edge systems", "demo-systems-maintainer/wasm-edge-tools", 0.85)
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
      ], 96, 8, "2026-01-20T12:00:00Z"),
      paper("Language Model Evaluation Notes", "Paper-like benchmark notes for language model evaluation and retrieval quality", "https://example.com/lm-eval-notes", "2026-03-11T12:00:00Z")
    ],
    claims: [
      demoClaim("research_area", "Language model evaluation researcher", "Language Model Evaluation Notes", 0.9),
      demoClaim("skill", "Python retrieval evaluation", "demo-ml-researcher/retrieval-eval", 0.88)
    ]
  }
];

export function createDemoProfiles(): PersonProfileRecord[] {
  return demoProfiles.map(({ person, artifacts, claims }) => {
    const normalizedClaims = normalizeClaims(claims);
    return {
    person: { ...person, publicStatus: "published" },
    sources: [
      {
        type: "github",
        url: `https://github.com/${person.handle}`,
        externalId: person.handle
      }
    ],
    artifacts,
    claims: normalizedClaims,
    cards: generateProfileCards(person, artifacts, normalizedClaims)
  };
  });
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

function project(
  title: string,
  description: string,
  topics: string[],
  manualImportance: number,
  updatedAt: string
): SearchArtifact {
  return {
    id: title,
    type: "project",
    title,
    description,
    url: `https://example.com/${title}`,
    metadata: { topics, manualImportance, updatedAt }
  };
}

function paper(title: string, description: string, url: string, publishedAt: string): SearchArtifact {
  return {
    id: title,
    type: "paper",
    title,
    description,
    url,
    metadata: { topics: ["language-models", "evaluation", "research"], publishedAt }
  };
}

function demoClaim(type: ProfileClaimRecord["type"], text: string, artifactId: string, confidence: number): ProfileClaimRecord {
  return {
    type,
    text,
    confidence,
    status: "approved",
    evidence: [{
      id: artifactId,
      type: "artifact",
      title: artifactId,
      reason: "Demo artifact supports this evidence-backed claim."
    }]
  };
}
