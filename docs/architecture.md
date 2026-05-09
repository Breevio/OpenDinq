# Architecture

OpenDinq is a local-first monorepo.

```text
apps/web
  Homepage
  Generate page
  Profile workspace
  Discover page
  Public profile page

apps/api
  Profile generation API
  People/search/cards/claims/publish API
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

## Product Flow

```text
Generate Profile -> Workspace -> Cards -> Public Profile -> Discover -> MCP/API automation
```

The workspace is a local-alpha curation surface. It is not auth-protected yet. It exists so generated profiles can be reviewed before they become a shareable public profile.

## Runtime Modes

MemoryStore is the default. It is used when `DATABASE_URL` is not set.

PrismaStore is used when `DATABASE_URL` is set. It stores people, sources, artifacts, claims, cards, and generation runs.

Both stores implement the same API-facing contract for profile generation runs, profile sources, people, artifacts, profile claims, cards, card visibility/order, publish state, and evidence retrieval.

## Claims And Publishing

Profile claims have a review status:

- `pending`
- `approved`
- `rejected`

Rejected claims are excluded from public profile output and are not emphasized in Discover. Public profiles have alpha-level `draft` or `published` status. This is product state only; it is not an authorization system.

## Search

Search currently combines:

- person text
- claims
- cards
- artifacts
- rule-based ranking signals
- full-text scoring

Vector search is not implemented as a production runtime yet.

Search responses include matched claims, matched cards, matched artifacts, top skills, evidence, and the public profile URL.

## MCP

The MCP server calls the API. It does not connect directly to the database.

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
