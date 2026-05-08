# Architecture

OpenDinq is a local-first monorepo.

```text
apps/web
  Generate page
  Discover page
  Public profile page

apps/api
  Profile generation API
  People/search/cards API
  Legacy GitHub import wrapper

apps/mcp
  API-backed MCP tools

packages/core
  Store contract
  MemoryStore

packages/db
  Prisma schema
  PrismaStore

packages/connectors
  GitHub
  Website
  OpenAlex
  arXiv
  ORCID

packages/cards
  Evidence-backed card generation

packages/search
  Rule/full-text hybrid search
```

## Runtime Modes

MemoryStore is the default. It is used when `DATABASE_URL` is not set.

PrismaStore is used when `DATABASE_URL` is set. It stores people, sources, artifacts, claims, cards, and generation runs.

## Search

Search currently combines:

- person text
- claims
- cards
- artifacts
- rule-based ranking signals
- full-text scoring

Vector search is not implemented as a production runtime yet.

## MCP

The MCP server calls the API. It does not connect directly to the database.

Primary tools:

- `opendinq_generate_profile`
- `opendinq_get_profile_run`
- `opendinq_search_people`
- `opendinq_get_profile`
- `opendinq_get_evidence`
- `opendinq_create_note_card`
