# OpenDinq

Evidence-backed AI-native profile generation and people discovery.

OpenDinq helps you generate a structured profile from public or user-provided sources, review the claims behind it, curate profile cards, publish a shareable profile, and search people with evidence.

```text
Generate Profile -> Workspace -> Claim Review -> Card Curation -> Public Profile -> Discover
```

## What It Does

- Generates profiles from GitHub, websites, OpenAlex, arXiv, ORCID, manual links, and notes.
- Turns source data into normalized, deduped, quality-scored evidence-backed claims.
- Builds evidence-backed profile cards from claims, artifacts, and evidence.
- Provides a local workspace for reviewing claims and editing cards.
- Publishes a card-first public profile page.
- Searches people by skills, claims, cards, artifacts, and evidence with score breakdowns.
- Exposes API and MCP tools for automation.

## Screenshots

![Generate](./docs/screenshots/generate.png)
![Workspace](./docs/screenshots/workspace.png)
![Discover](./docs/screenshots/discover.png)
![Profile](./docs/screenshots/profile.png)

## Requirements

- Node.js 22+
- pnpm 10+
- Optional: Docker Desktop if you want Postgres persistence
- Optional: `GITHUB_TOKEN` for higher GitHub API rate limits

Check your versions:

```bash
node --version
pnpm --version
```

## Start From Zero

Clone the repo:

```bash
git clone https://github.com/Breevio/OpenDinq.git
cd OpenDinq
```

Install dependencies:

```bash
pnpm install
```

Start the API and web app:

```bash
pnpm dev
```

Open the app:

- Web: http://localhost:3000
- Generate: http://localhost:3000/generate
- Discover: http://localhost:3000/discover
- Demo profile: http://localhost:3000/u/demo-agent-builder
- API health: http://localhost:3001/health

The default runtime uses in-memory demo data, so you can try the product without setting up a database or API keys.

## Generate Your First Profile

1. Open http://localhost:3000/generate.
2. Paste one input: a URL, GitHub username, ORCID, arXiv/OpenAlex id, website, or natural-language request.
3. Click **Preview plan** to see inferred intent and sources.
4. Click **Generate profile**.
5. Open the generated workspace.

Examples:

```text
https://github.com/torvalds
torvalds
0000-0002-1825-0097
https://example.com/about
AI product engineer who built an evidence-backed workflow
```

After generation, open:

```text
http://localhost:3000/u/ada-builder/workspace
```

The workspace lets you:

- review generated claims
- approve, reject, or mark claims as pending
- edit card titles and markdown
- change card visibility
- reorder cards
- regenerate deterministic cards
- add manual note cards
- publish or move the profile back to draft

## Try Discover

Open http://localhost:3000/discover and search with natural language.

Useful demo queries:

```text
AI agent builders with TypeScript and MCP
researchers working on language models
open-source infrastructure engineers
people with strong evidence in product design
profiles with manual notes about startups
evidence-backed profile cards
```

Search results show:

- match score
- explanation
- matched claims
- matched cards
- matched artifacts
- evidence snippets
- score breakdown / why matched
- link to the public profile

## Generate Through The API

Start the API:

```bash
pnpm dev:api
```

Plan a single-input profile generation:

```bash
curl -X POST http://localhost:3001/api/profiles/plan \
  -H "content-type: application/json" \
  -d '{ "input": "https://github.com/torvalds" }'
```

Generate from one input:

```bash
curl -X POST http://localhost:3001/api/profiles/generate-ai \
  -H "content-type: application/json" \
  -d '{ "input": "AI product engineer who built an evidence-backed workflow" }'
```

The deterministic advanced API still accepts explicit sources:

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

Check the generated profile:

```bash
curl http://localhost:3001/api/people/ada-builder
```

Search:

```bash
curl "http://localhost:3001/api/search?q=AI%20product%20engineer%20agent%20workflow"
```

## API Routes

Profile generation:

```text
POST /api/profiles/plan
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

## Optional LLM Rewrite

## LLM-Powered Generation

LLM generation is disabled by default. Enable OpenAI-compatible planning and claim synthesis with:

```bash
OPEN_DINQ_ENABLE_LLM_GENERATION=true
OPEN_DINQ_LLM_PROVIDER=openai-compatible
OPEN_DINQ_LLM_MODEL=gpt-4.1-mini
OPEN_DINQ_LLM_API_KEY=...
# optional:
OPEN_DINQ_LLM_BASE_URL=https://api.openai.com/v1
```

When enabled, OpenDinq uses the LLM to interpret the single input, infer safe sources, plan generation, synthesize evidence-backed claims from connector outputs, and explain warnings. It does not invent sources, does not run web-wide entity search, and discards claims without valid evidence.

If LLM config is missing, `/generate` and `/api/profiles/plan` clearly report deterministic fallback mode.

Card generation is deterministic by default. An experimental evidence-constrained rewrite path is available only when explicitly enabled:

```bash
OPEN_DINQ_ENABLE_LLM_REWRITE=true
OPENAI_API_KEY=...
# optional:
OPEN_DINQ_LLM_BASE_URL=https://api.openai.com/v1
OPEN_DINQ_LLM_MODEL=gpt-4.1-mini
```

The rewrite receives only the draft card, allowed claims, and evidence refs. If the model fails or returns unsupported content, OpenDinq falls back to the deterministic card.

## Runtime Modes

### MemoryStore

MemoryStore is the default when `DATABASE_URL` is not set.

Use it for local demos and development:

```bash
pnpm dev
```

Data is not persisted after the API process restarts.

### PrismaStore With Postgres

Use Postgres when you want imported profiles to persist.

Start Postgres:

```bash
docker compose up -d postgres
```

Generate Prisma Client and run migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

Verify the DB runtime:

```bash
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

## MCP

OpenDinq includes an API-backed MCP server for tools such as profile generation, search, claim updates, card updates, and publishing.

Start the API:

```bash
pnpm dev:api
```

Start the MCP server:

```bash
OPENDINQ_API_URL=http://localhost:3001 pnpm --filter @opendinq/mcp start
```

Available tools include:

```text
opendinq_generate_profile
opendinq_get_profile_run
opendinq_get_profile_workspace
opendinq_update_claim
opendinq_update_card
opendinq_regenerate_card
opendinq_publish_profile
opendinq_search_people
opendinq_get_profile
opendinq_get_evidence
opendinq_create_note_card
opendinq_import_github_profile
opendinq_list_cards
```

Example client configs are in [`examples/mcp`](./examples/mcp).

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

## More Docs

- [Architecture](./docs/architecture.md)
- [Profile Generator](./docs/profile-generator.md)
- [Profile Workspace](./docs/profile-workspace.md)
- [Evidence Model](./docs/evidence-model.md)
- [Card System](./docs/card-system.md)
- [Discover](./docs/discover.md)
- [DB Runtime](./docs/db-runtime.md)
