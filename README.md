# OpenDinq

OpenDinq is an open-source product alpha for evidence-backed AI-native profile generation and people discovery.

It turns public or user-provided sources into claims, cards, public profiles, searchable evidence, and MCP/API automation.

```text
Generate Profile -> Workspace -> Cards -> Public Profile -> Discover -> MCP/API automation
```

## What You Can Do

- Generate a profile from GitHub, website, OpenAlex, arXiv, ORCID, manual artifacts, or notes.
- Review evidence-backed claims in a local profile workspace.
- Curate cards by editing, reordering, hiding, regenerating, or adding manual note cards.
- Publish or draft a profile in local-alpha mode.
- Share a card-first public profile.
- Search Discover for people by claims, cards, artifacts, skills, and evidence.
- Use MCP tools to generate profiles, update cards/claims, publish profiles, and search people.

## Screenshots

![Generate](./docs/screenshots/generate.png)
![Workspace](./docs/screenshots/workspace.png)
![Discover](./docs/screenshots/discover.png)
![Profile](./docs/screenshots/profile.png)

## Requirements

- Node.js 22+
- pnpm 10+
- Optional: Docker Desktop for Postgres
- Optional: `GITHUB_TOKEN` for higher GitHub API rate limits

## Quickstart

```bash
pnpm install
pnpm dev
```

Open:

- http://localhost:3000/
- http://localhost:3000/generate
- http://localhost:3000/discover
- http://localhost:3000/u/demo-agent-builder

The API starts with demo profiles, so Discover works without external keys.

## Generate A Profile

```bash
curl -X POST http://localhost:3001/api/profiles/generate \
  -H "content-type: application/json" \
  -d '{
    "displayName": "Demo Agent Builder",
    "handle": "demo-agent-builder",
    "headline": "AI agent engineer",
    "sources": [
      { "type": "github", "input": "demo-agent-builder" },
      { "type": "website", "input": "https://example.com" },
      {
        "type": "manual",
        "input": {
          "title": "Built MCP tools",
          "url": "https://example.com/project",
          "note": "Built MCP tools for profile automation."
        }
      }
    ]
  }'
```

Useful URLs after generation:

- `/u/:handle/workspace` for claim review, card curation, and publishing.
- `/u/:handle` for the public profile.
- `/discover?q=...` for evidence-backed people search.

## API Highlights

```text
POST  /api/profiles/generate
GET   /api/profile-runs/:runId
GET   /api/people/:handle
GET   /api/people/:handle/workspace
GET   /api/people/:handle/claims
PATCH /api/claims/:claimId
GET   /api/people/:handle/cards
PATCH /api/cards/:cardId
POST  /api/cards/:cardId/regenerate
POST  /api/people/:handle/cards/manual-note
PATCH /api/people/:handle/publish
GET   /api/search?q=...
```

`POST /api/import/github` remains available as a compatibility wrapper around profile generation.

## Runtime Modes

OpenDinq uses MemoryStore by default. It is fast and requires no database, but imported data is lost when the API restarts.

To persist data with Postgres:

```bash
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
DATABASE_URL="postgresql://opendinq:opendinq@localhost:5432/opendinq" pnpm verify:db
DATABASE_URL="postgresql://opendinq:opendinq@localhost:5432/opendinq" pnpm dev:api
```

Without `DATABASE_URL`, the API uses MemoryStore.

## MCP

Start the API:

```bash
pnpm dev:api
```

Start the MCP server:

```bash
OPENDINQ_API_URL=http://localhost:3001 pnpm --filter @opendinq/mcp start
```

Primary tools:

- `opendinq_generate_profile`
- `opendinq_get_profile_run`
- `opendinq_get_profile_workspace`
- `opendinq_update_claim`
- `opendinq_update_card`
- `opendinq_regenerate_card`
- `opendinq_publish_profile`
- `opendinq_search_people`
- `opendinq_get_profile`
- `opendinq_get_evidence`
- `opendinq_create_note_card`
- `opendinq_import_github_profile`
- `opendinq_list_cards`

Config examples live in `examples/mcp/`.

## Commands

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

## Docs

- [Architecture](./docs/architecture.md)
- [Profile Generator](./docs/profile-generator.md)
- [Profile Workspace](./docs/profile-workspace.md)
- [Evidence Model](./docs/evidence-model.md)
- [Card System](./docs/card-system.md)
- [Discover](./docs/discover.md)
- [DB Runtime](./docs/db-runtime.md)

## Current Limits

- Not production-ready.
- No production auth, ownership, or claim verification yet.
- The local-alpha workspace is not a security boundary.
- Publishing is alpha-level draft/published state, not a full permissions system.
- Semantic/vector search is not production runtime.
- Card regeneration is deterministic and evidence-bound.
- Connector quality depends on source data quality.
- LinkedIn/X scraping, private DINQ APIs, browser automation, and login-gated scraping are intentionally out of scope.
