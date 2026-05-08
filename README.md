# OpenDinq

OpenDinq turns public work signals into evidence-backed people profiles and searchable profile cards.

You can import a GitHub profile, attach public artifacts from sources like websites, OpenAlex, arXiv, and ORCID, then search people with natural-language queries. Search results include explanations and evidence links.

## Features

- GitHub profile import
- Website, OpenAlex, arXiv, ORCID, and manual artifact imports
- Deterministic profile cards backed by evidence
- Natural-language people search
- Search explanations with evidence refs
- Local web UI
- Hono API
- MCP server for coding agents
- Optional Postgres persistence through Prisma

## Screenshots

### Import

![Import](./docs/screenshots/import.png)

### Discover

![Discover](./docs/screenshots/discover.png)

### Profile

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

- http://localhost:3000/import
- http://localhost:3000/discover
- http://localhost:3000/u/demo-agent-builder

The API starts with demo profiles, so search works without any API keys.

Useful demo searches:

```text
AI agent developers using TypeScript and MCP
systems programming open source maintainers
machine learning researchers with Python projects
```

## Configuration

Create a local env file if needed:

```bash
cp .env.example .env
```

Common variables:

```bash
GITHUB_TOKEN=""
DATABASE_URL="postgresql://opendinq:opendinq@localhost:5432/opendinq"
OPENDINQ_API_URL="http://localhost:3001"
NEXT_PUBLIC_OPENDINQ_API_URL="http://localhost:3001"
```

`GITHUB_TOKEN` is optional, but recommended for real GitHub imports. Anonymous GitHub API calls can hit rate limits quickly.

## Commands

```bash
pnpm dev              # Start API and web app
pnpm dev:api          # Start API on port 3001
pnpm dev:web          # Start web app on port 3000
pnpm seed:demo        # Seed demo profiles into the running API
pnpm screenshots      # Capture screenshots into docs/screenshots
pnpm typecheck        # Type-check all workspaces
pnpm test             # Run tests
pnpm build            # Build all workspaces
pnpm check            # Install, type-check, test, lint, and build
```

## API

The local API runs at `http://localhost:3001`.

Health check:

```bash
curl http://localhost:3001/health
```

Import a GitHub profile:

```bash
curl -X POST http://localhost:3001/api/import/github \
  -H "content-type: application/json" \
  -d '{"input":"torvalds"}'
```

Attach public evidence to an existing profile:

```bash
curl -X POST http://localhost:3001/api/import/website \
  -H "content-type: application/json" \
  -d '{"handle":"demo-agent-builder","url":"https://example.com"}'

curl -X POST http://localhost:3001/api/import/openalex \
  -H "content-type: application/json" \
  -d '{"handle":"demo-agent-builder","input":"A123456789"}'

curl -X POST http://localhost:3001/api/import/arxiv \
  -H "content-type: application/json" \
  -d '{"handle":"demo-agent-builder","input":"2601.01234"}'

curl -X POST http://localhost:3001/api/import/orcid \
  -H "content-type: application/json" \
  -d '{"handle":"demo-agent-builder","input":"0000-0002-1825-0097"}'
```

Attach a manual artifact:

```bash
curl -X POST http://localhost:3001/api/people/demo-agent-builder/artifacts \
  -H "content-type: application/json" \
  -d '{"type":"project","title":"Agent evaluation dashboard","url":"https://example.com/agent-eval"}'
```

Search people:

```bash
curl "http://localhost:3001/api/search?q=AI%20agent%20developers%20using%20TypeScript%20and%20MCP"
```

Read a profile:

```bash
curl http://localhost:3001/api/people/demo-agent-builder
```

List cards:

```bash
curl http://localhost:3001/api/cards/demo-agent-builder
```

Create a note card:

```bash
curl -X POST http://localhost:3001/api/cards/demo-agent-builder/note \
  -H "content-type: application/json" \
  -d '{"title":"Availability note","contentMd":"Interested in AI agent tooling."}'
```

## Postgres

OpenDinq uses the in-memory store by default. To persist imported profiles across API restarts, run Postgres and set `DATABASE_URL`.

```bash
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
DATABASE_URL="postgresql://opendinq:opendinq@localhost:5432/opendinq" pnpm dev:api
```

Without `DATABASE_URL`, the API falls back to the in-memory store.

## MCP

Start the API first:

```bash
pnpm dev:api
```

Then start the MCP server:

```bash
OPENDINQ_API_URL=http://localhost:3001 pnpm --filter @opendinq/mcp start
```

Config examples:

- `examples/mcp/codex.json`
- `examples/mcp/cursor.json`
- `examples/mcp/claude-desktop.json`

Tools:

- `opendinq_import_github_profile`
- `opendinq_search_people`
- `opendinq_get_person_profile`
- `opendinq_get_evidence`
- `opendinq_list_cards`
- `opendinq_create_note_card`

## Project Structure

```text
apps/
  web/      Next.js app
  api/      Hono API
  mcp/      stdio MCP server
  worker/   background job placeholder

packages/
  core/        store contract and memory store
  db/          Prisma schema and Postgres store
  connectors/ GitHub, website, OpenAlex, arXiv, ORCID
  cards/       deterministic card generation
  search/      query parsing, ranking, full-text scoring, hybrid merge
  shared/      Zod schemas and shared types
  llm/         LLM boundary placeholder
```

## Development

Run the full check before opening a PR:

```bash
./scripts/check.sh
```

For UI changes, also run the app and refresh screenshots:

```bash
pnpm dev
pnpm screenshots
```

OpenDinq only uses public or user-authorized data sources. LinkedIn/X scraping, private DINQ APIs, and login-gated scraping are intentionally not part of the project.
