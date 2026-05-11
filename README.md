<p align="center">
  <img src="./docs/assets/opendinq-logo.png" alt="OpenDinq" width="720" />
</p>

<p align="center">
  <strong>Evidence-backed AI profiles for explainable people discovery.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#try-it">Try It</a> ·
  <a href="#runtime-modes">Runtime Modes</a> ·
  <a href="#optional-integrations">Optional Integrations</a> ·
  <a href="#development">Development</a>
</p>

<p align="center">
  <img alt="Node.js 22+" src="https://img.shields.io/badge/node-%3E%3D22-339933" />
  <img alt="pnpm 10+" src="https://img.shields.io/badge/pnpm-%3E%3D10-F69220" />
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-yellow" />
</p>

# OpenDinq

OpenDinq is an open-source product alpha for evidence-backed AI-native profiles, card workspaces, and explainable people discovery. It turns public or user-provided sources into structured profiles, reviewable claims, curated cards, and searchable public profile pages.

```text
Generate Profile -> Workspace -> Claim Review -> Card Curation -> Public Profile -> Discover
```

The default runtime uses in-memory demo data, so you can try the product locally without setting up a database or adding OpenAI, Anthropic, or GitHub API keys.

## What It Does

- Generates profiles from GitHub, websites, OpenAlex, arXiv, ORCID, manual links, and notes.
- Turns source data into evidence-backed claims.
- Builds DINQ-style profile cards from claims, artifacts, and evidence.
- Provides a local workspace for reviewing claims and editing cards.
- Publishes card-first public profile pages.
- Searches people by skills, claims, cards, artifacts, and evidence.
- Exposes API and MCP tools for automation.

## Quick Start

Requirements:

- Node.js 22+
- pnpm 10+
- Optional: Docker Desktop for Postgres persistence
- Optional: `GITHUB_TOKEN` for higher GitHub API rate limits

```bash
git clone https://github.com/Breevio/OpenDinq.git
cd OpenDinq
pnpm install
pnpm dev
```

Open:

- Web: http://localhost:3000
- Generate: http://localhost:3000/generate
- Discover: http://localhost:3000/discover
- Demo profile: http://localhost:3000/u/demo-agent-builder
- API health: http://localhost:3001/health

## Try It

### Generate Your First Profile

1. Open http://localhost:3000/generate.
2. Search for a person by name, describe the kind of person you want, or paste a public source.
3. Click **Preview candidates** when you want to confirm matches first, or **Search & generate** to auto-generate from a high-confidence match.
4. If the name is ambiguous, choose a candidate and click **Generate this profile**.
5. Open the generated workspace.

For the simplest first run, use only manual data:

```text
https://github.com/torvalds
Jiajun Wu
Linus Torvalds
AI agent builders working on MCP
Stanford researcher working on 3D scene understanding
```

After generation, open:

```text
http://localhost:3000/u/ada-builder/workspace
```

The workspace lets you review generated claims, approve or reject them, edit cards, change visibility, reorder cards, add manual notes, and publish or move the profile back to draft.

### Explore Discover

Open http://localhost:3000/discover and search with natural language.

Useful demo queries:

```text
AI agent builders with TypeScript and MCP
researchers working on language models
open-source infrastructure engineers
people with strong evidence in product design
profiles with manual notes about startups
```

Search results show match scores, explanations, matched claims, cards, artifacts, evidence snippets, and links to public profiles.

## Runtime Modes

### MemoryStore

MemoryStore is the default when `DATABASE_URL` is not set.

```bash
pnpm dev
```

Use it for local demos and development. Data is not persisted after the API process restarts.

### PrismaStore With Postgres

Use Postgres when you want imported profiles to persist.

```bash
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
DATABASE_URL="postgresql://opendinq:opendinq@localhost:5432/opendinq" pnpm verify:db
```

Start the API with Postgres:

```bash
DATABASE_URL="postgresql://opendinq:opendinq@localhost:5432/opendinq" pnpm dev:api
```

Start the web app in another terminal:

```bash
pnpm dev:web
```

## Optional Integrations

### GitHub Token

`GITHUB_TOKEN` is optional. Add it only if you want a higher GitHub API rate limit for GitHub profile imports. Keep tokens local and out of Git, and use the minimum permissions needed for your workflow.

### LLM-Powered Generation

LLM generation is disabled by default. Enable OpenAI-compatible planning and claim synthesis with:

```bash
OPEN_DINQ_ENABLE_LLM_GENERATION=true
OPEN_DINQ_LLM_PROVIDER=openai-compatible
OPEN_DINQ_LLM_MODEL=gpt-4.1-mini
OPEN_DINQ_LLM_API_KEY=...
# optional:
OPEN_DINQ_LLM_CHAT_COMPLETIONS_URL=https://api.openai.com/v1/chat/completions
OPEN_DINQ_LLM_BASE_URL=https://api.openai.com/v1
OPEN_DINQ_LLM_TIMEOUT_MS=90000
OPEN_DINQ_LLM_MAX_TOKENS=1200
```

When enabled, raw input becomes one `ProfileGenerationPlan`, then OpenDinq executes explicit sources and opens a review workspace. User-provided descriptions become user-provided claims, not verified evidence. OpenDinq does not invent sources, does not run browser scraping or production web-wide entity search, and never pretends missing evidence exists.

If LLM config is missing, times out, or returns unusable JSON, `/generate` and `/api/profiles/plan` use local fallback planning and return `llmUsed: false`. Natural-language-only input still creates a reviewable workspace.

### Optional LLM Rewrite

Card generation is deterministic by default. An experimental evidence-constrained rewrite path is available only when explicitly enabled:

```bash
OPEN_DINQ_ENABLE_LLM_REWRITE=true
OPENAI_API_KEY=...
# optional:
OPEN_DINQ_LLM_BASE_URL=https://api.openai.com/v1
OPEN_DINQ_LLM_MODEL=gpt-4.1-mini
```

The rewrite receives only the draft card, allowed claims, and evidence refs. If the model fails or returns unsupported content, OpenDinq falls back to the deterministic card.

### MCP

OpenDinq includes an API-backed MCP server for profile generation, workspace review, claim updates, card updates, publishing, evidence lookup, and search.

```bash
pnpm dev:api
OPENDINQ_API_URL=http://localhost:3001 pnpm --filter @opendinq/mcp start
```

Example client configs are in [`examples/mcp`](./examples/mcp).

## API

Core routes:

```text
POST /api/profiles/generate
GET  /api/profile-runs/:runId
GET  /api/people/:handle
GET  /api/people/:handle/workspace
PATCH /api/people/:handle/publish
GET  /api/search?q=...
POST /api/import/github
```

Create a profile:

```bash
curl -X POST http://localhost:3001/api/profiles/generate \
  -H "content-type: application/json" \
  -d '{
    "displayName": "Ada Builder",
    "handle": "ada-builder",
    "headline": "AI product engineer",
    "sources": [
      {
        "type": "manual",
        "input": {
          "title": "Built an agent workflow",
          "url": "https://example.com/agent-workflow",
          "note": "Designed and shipped an evidence-backed AI workflow for profile generation."
        }
      }
    ]
  }'
```

Search:

```bash
curl "http://localhost:3001/api/search?q=AI%20product%20engineer%20agent%20workflow"
```

## API Routes

Profile generation:

```text
POST /api/profiles/plan
POST /api/profiles/resolve
POST /api/profiles/search-and-generate
POST /api/profiles/generate-from-candidate
POST /api/profiles/generate-ai
POST /api/profiles/generate
GET  /api/profile-runs/:runId
```

Profiles and workspace:

```text
GET   /api/people/:handle
GET   /api/people/:handle/workspace
PATCH /api/people/:handle/publish
```

Claims:

```text
GET   /api/people/:handle/claims
PATCH /api/claims/:claimId
```

Cards:

```text
GET   /api/people/:handle/cards
PATCH /api/cards/:cardId
POST  /api/cards/:cardId/regenerate
POST  /api/people/:handle/cards/manual-note
```

Search:

```text
GET /api/search?q=...
```

Compatibility:

```text
POST /api/import/github
```

## Development Commands

```bash
pnpm dev              # Start API and web app
pnpm dev:api          # Start API on port 3001
pnpm dev:web          # Start web app on port 3000
pnpm seed:demo        # Seed demo profiles into the running API
pnpm screenshots      # Capture screenshots into docs/screenshots
pnpm db:generate      # Generate Prisma Client
pnpm db:validate      # Validate Prisma schema
pnpm db:migrate       # Apply Prisma migrations
pnpm verify:db        # Verify DB runtime when DATABASE_URL is set
pnpm typecheck        # Type-check all workspaces
pnpm test             # Run tests
pnpm build            # Build all workspaces
pnpm check            # Install, type-check, test, lint, and build
```

## Project Structure

```text
apps/
  web/      Next.js app
  api/      Hono API
  mcp/      MCP server
  worker/   worker placeholder

packages/
  core/        store contract and MemoryStore
  db/          Prisma schema and PrismaStore
  connectors/ source connectors
  cards/       card generation
  search/      people search
  shared/      Zod schemas and shared types
  llm/         LLM boundary placeholder

docs/          architecture and product docs
examples/      demo profiles and MCP configs
scripts/       dev, screenshot, seed, and DB verification scripts
```

## Contributing

Friendly issues, bug reports, docs improvements, and pull requests are welcome.

Before opening a pull request, run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Do not commit `.env`, API keys, tokens, cookies, passwords, `node_modules`, `.next`, or local logs.

## Documentation

- [Architecture](./docs/architecture.md)
- [Profile Generator](./docs/profile-generator.md)
- [Profile Workspace](./docs/profile-workspace.md)
- [Evidence Model](./docs/evidence-model.md)
- [Card System](./docs/card-system.md)
- [Discover](./docs/discover.md)
- [DB Runtime](./docs/db-runtime.md)
