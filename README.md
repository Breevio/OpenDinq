# OpenDinq

OpenDinq is an open-source, GitHub-first MVP for evidence-backed AI-native people profiles and natural-language talent search.

It turns public profile signals into structured people profiles, cards, and searchable evidence-backed results.

## What It Does

- Import a public GitHub profile.
- Normalize repositories into evidence artifacts.
- Generate deterministic profile cards backed by evidence.
- Search people with natural-language queries.
- Return ranked results with explanations and evidence.
- Expose a local MCP server so coding agents can import profiles, search people, read profiles, list cards, and create note cards.

OpenDinq is not a DINQ fork. It does not copy DINQ code, branding, private APIs, layouts, or assets.

## Current Status

OpenDinq is currently a `v0.1-alpha` local MVP.

What works today:

- GitHub/demo profile ingestion
- Person, artifact, card, and evidence data model
- Rule-based people search
- Match explanations with evidence
- Minimal web UI
- API health endpoint
- Experimental MCP package
- Screenshots generated from the running app
- Evidence refs for every card and search result

Current limitations:

- Runtime is in-memory by default
- Imported data is not persisted after restart
- Search is rule-based, not semantic/vector search yet
- Postgres runtime is available when `DATABASE_URL` is set, but still experimental
- Docker/Postgres setup is experimental
- GitHub-first only
- No auth, inbox, credits, or team workspace
- LinkedIn/X scraping

## Screenshots

### Import

![Import](./docs/screenshots/import.png)

### Discover

![Discover](./docs/screenshots/discover.png)

### Profile

![Profile](./docs/screenshots/profile.png)

## Architecture

```text
apps/
  web/      Next.js UI for import, discover, and public profile pages
  api/      Hono API for import, people, search, cards, and demo seed
  mcp/      stdio MCP server that calls the OpenDinq API
  worker/   reserved for background ingestion/indexing jobs

packages/
  shared/      Zod schemas and shared domain types
  core/        domain package placeholder
  connectors/ GitHub connector and normalization
  cards/       deterministic evidence-backed card generation
  search/      rule-based query parsing, ranking, explanation, evidence
  db/          Prisma schema, migration, and repository boundaries
  llm/         reserved LLM package boundary
```

Runtime flow:

```text
GitHub username or URL
  -> GitHub connector
  -> Person + Artifact normalization
  -> deterministic cards
  -> local API store
  -> Web UI / Search API / MCP tools
```

Search flow:

```text
Natural-language query
  -> query terms
  -> skill + artifact text matching
  -> impact, recency, completeness signals
  -> ranked results
  -> explanation + evidence refs
```

## Requirements

- Node.js 22+
- pnpm 10+
- Optional: Docker Desktop for local PostgreSQL
- Optional: `GITHUB_TOKEN` for higher GitHub API rate limits

## Quickstart

Install dependencies and start the local MVP:

```bash
pnpm install
pnpm dev
```

Open:

- http://localhost:3000/import
- http://localhost:3000/discover
- http://localhost:3000/u/demo-agent-builder

The API starts with three demo profiles by default, so `/discover` works without external API keys.

For separate terminals:

```bash
pnpm dev:api
pnpm dev:web
```

Run the full check:

```bash
./scripts/check.sh
```

To reseed a running API:

```bash
pnpm seed:demo
```

Useful demo searches:

- `AI agent developers using TypeScript and MCP`
- `systems programming open source maintainers`
- `machine learning researchers with Python projects`

## Environment

Create `.env` from `.env.example` if you need local overrides:

```bash
cp .env.example .env
```

Supported variables:

```bash
DATABASE_URL="postgresql://opendinq:opendinq@localhost:5432/opendinq"
GITHUB_TOKEN=""
OPENDINQ_API_URL="http://localhost:3001"
```

`GITHUB_TOKEN` is optional. Do not commit real tokens or API keys.

## Commands

```bash
pnpm dev              # Start local API and web app together
pnpm dev:api          # Start only the Hono API on port 3001
pnpm dev:web          # Start the Next.js web app on port 3000
pnpm seed:demo        # Seed demo profiles into the running API
pnpm screenshots      # Capture MVP screenshots into docs/screenshots
pnpm db:generate      # Generate Prisma Client
pnpm db:migrate       # Apply committed Prisma migrations
pnpm db:migrate:dev   # Create/apply migrations during development
pnpm typecheck        # Type-check all workspaces
pnpm test             # Run all tests
pnpm build            # Build all workspaces
pnpm check            # Install, type-check, test, lint, and build
```

## API

The local API is unauthenticated for the MVP.

```bash
curl http://localhost:3001/health
```

Import a GitHub profile:

```bash
curl -X POST http://localhost:3001/api/import/github \
  -H "content-type: application/json" \
  -d '{"input":"torvalds"}'
```

Get a profile:

```bash
curl http://localhost:3001/api/people/demo-agent-builder
```

Search people:

```bash
curl "http://localhost:3001/api/search?q=AI%20agent%20developers%20using%20TypeScript%20and%20MCP"
```

List cards:

```bash
curl http://localhost:3001/api/cards/demo-agent-builder
```

Create a manual note card:

```bash
curl -X POST http://localhost:3001/api/cards/demo-agent-builder/note \
  -H "content-type: application/json" \
  -d '{"title":"Availability note","contentMd":"Interested in AI agent tooling."}'
```

Seed demo data:

```bash
curl -X POST http://localhost:3001/api/seed/demo
```

## Runtime Modes

### Default: In-Memory Mode

No database is required. This is the default local demo path.

The API starts with seed profiles and accepts GitHub imports, but imported data is not persisted after restart.

### Experimental: Postgres Mode

When `DATABASE_URL` is set, the API uses the Prisma/Postgres store instead of the in-memory store. Imported profiles, artifacts, and cards persist across API restarts.

If `DATABASE_URL` is not set, the API falls back to in-memory mode.

Start local Postgres:

```bash
docker compose up -d postgres
```

Generate Prisma Client and apply migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

Start the API in Postgres mode:

```bash
DATABASE_URL="postgresql://opendinq:opendinq@localhost:5432/opendinq" pnpm dev:api
```

Validate the schema without Docker:

```bash
DATABASE_URL="postgresql://opendinq:opendinq@localhost:5432/opendinq" \
  pnpm --filter @opendinq/db exec prisma validate --schema prisma/schema.prisma
```

## MCP

Build the workspace, start the API, then point an MCP client at `@opendinq/mcp`:

```bash
./scripts/check.sh
pnpm dev:api
OPENDINQ_API_URL=http://localhost:3001 pnpm --filter @opendinq/mcp start
```

Config examples live in `examples/mcp/`:

- `examples/mcp/codex.json`
- `examples/mcp/cursor.json`
- `examples/mcp/claude-desktop.json`

The MCP server exposes:

- `import_github_profile`
- `search_people`
- `get_person_profile`
- `list_cards`
- `create_note_card`

## Data And Compliance Boundaries

OpenDinq is built around public or user-authorized data.

The MVP intentionally does not include:

- LinkedIn scraping
- X scraping
- login-gated scholar scraping
- private DINQ API integration
- browser automation
- automatic outreach

Every generated card and search result should preserve evidence refs. This is the main product distinction from generic AI people search.

## Development Notes

Read these files before making larger changes:

- `AGENTS.md`
- `PROJECT_SPEC.md`
- `MVP_SLICE.md`
- `CODEBASE_NOTES.md`
- `DECISIONS.md`
- `TASKS.md`
- `docs/roadmap.md`
- `docs/release-checklist.md`

Run before claiming work is complete:

```bash
./scripts/check.sh
```

For UI changes, also run:

```bash
pnpm dev:api
pnpm dev:web
pnpm screenshots
```

## Project Status

All items in `TASKS.md` are complete for the current MVP checklist.

Known limitations:

- In-memory runtime remains the default local mode.
- Postgres runtime is implemented but still experimental.
- Docker must be running before local Postgres migrations can be applied.
- `pnpm audit --audit-level high` passes.

## License

MIT. See `LICENSE`.
