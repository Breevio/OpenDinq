# OpenDinq

OpenDinq is an open-source profile generator for evidence-backed AI-native profiles, cards, and people search.

Primary flow:

```text
Generate Profile -> Cards -> Public Profile -> Discover
```

GitHub is one connector. Profiles can also use websites, OpenAlex, arXiv, ORCID, and manual links or notes.

## Features

- Multi-source profile generation
- Evidence-backed claims
- DINQ-style profile cards
- Public profile pages
- Natural-language discover search
- Local API
- MCP tools for coding agents
- MemoryStore by default, Prisma/Postgres when configured

## Screenshots

![Generate](./docs/screenshots/generate.png)
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

- http://localhost:3000/generate
- http://localhost:3000/discover
- http://localhost:3000/u/demo-agent-builder

The API starts with demo profiles, so discover works without external keys.

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

Check a generation run:

```bash
curl http://localhost:3001/api/profile-runs/<runId>
```

Read the generated profile:

```bash
curl http://localhost:3001/api/people/demo-agent-builder
```

Search:

```bash
curl "http://localhost:3001/api/search?q=AI%20agent%20MCP%20profile%20automation"
```

## Sources

Supported generator sources:

- `github`
- `website`
- `openalex`
- `arxiv`
- `orcid`
- `manual`

Sources are optional. A profile can be generated from one source or many sources.

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

## Runtime Modes

OpenDinq uses MemoryStore by default. It is good for local demos and tests.

To persist data with Postgres:

```bash
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
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

Tools:

- `opendinq_generate_profile`
- `opendinq_get_profile_run`
- `opendinq_search_people`
- `opendinq_get_profile`
- `opendinq_get_evidence`
- `opendinq_create_note_card`
- `opendinq_import_github_profile`
- `opendinq_list_cards`

Config examples live in `examples/mcp/`.

## Project Structure

```text
apps/
  web/      Next.js app
  api/      Hono API
  mcp/      stdio MCP server
  worker/   background job placeholder

packages/
  core/        store contract and MemoryStore
  db/          Prisma schema and PrismaStore
  connectors/ GitHub, website, OpenAlex, arXiv, ORCID
  cards/       evidence-backed card generation
  search/      query parsing, ranking, full-text scoring, hybrid merge
  shared/      Zod schemas and shared types
  llm/         LLM boundary placeholder
```

## Docs

- [Profile Generator](./docs/profile-generator.md)
- [Evidence Model](./docs/evidence-model.md)
- [Architecture](./docs/architecture.md)

## Notes

- Not production-ready.
- No auth, teams, billing, or permissions yet.
- Semantic vector search is still a future layer; current search is rule/full-text hybrid.
- Multi-source generation quality depends on source data quality.
- Cards are generated from evidence-backed claims.
- LinkedIn/X scraping, private DINQ APIs, browser automation, and login-gated scraping are intentionally out of scope.
