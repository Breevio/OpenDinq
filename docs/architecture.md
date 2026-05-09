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
  Claim quality pipeline

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

packages/llm
  Intent planner
  Evidence-constrained claim synthesis
  Optional evidence-constrained card rewrite helper
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

Raw connector claims pass through normalization, dedupe, ranking, and quality scoring before card generation. The quality score uses evidence count, source/artifact quality, confidence, specificity, generic-claim penalties, and manual-source signals.

Rejected claims are excluded from public profile output and Discover ranking. Public profiles have alpha-level `draft` or `published` status. This is product state only; it is not an authorization system.

## Search

Search currently combines:

- person text
- claims
- cards
- artifacts
- rule-based ranking signals
- full-text scoring

Vector search is not implemented as a production runtime yet.

Search responses include matched claims, matched cards, matched artifacts, top skills, evidence, score breakdown, and the public profile URL.

The score breakdown includes claim, card, artifact, skill, evidence, publish boost, recency, and final score.

## Optional LLM Layer

LLM generation is disabled by default. When `OPEN_DINQ_ENABLE_LLM_GENERATION=true`, `OPEN_DINQ_LLM_MODEL`, and `OPEN_DINQ_LLM_API_KEY` are present, the API uses an LLM-first planner to convert raw input into one `ProfileGenerationPlan`. `OPEN_DINQ_LLM_CHAT_COMPLETIONS_URL` may point directly at a provider endpoint; `OPEN_DINQ_LLM_BASE_URL` remains supported. Slow or invalid provider responses fall back to local planning with `llmUsed: false`; `OPEN_DINQ_LLM_TIMEOUT_MS` and `OPEN_DINQ_LLM_MAX_TOKENS` can tune provider behavior.

LLM rewrite is separately gated by `OPEN_DINQ_ENABLE_LLM_REWRITE=true`. Generated cards are still deterministic first; the helper validates used claim/evidence ids and falls back to deterministic content on failure or unsupported output.

OpenDinq does not invent sources and does not perform production web-wide entity search. Natural-language input becomes user-provided claims plus missing-evidence prompts. Connector failures should create a reviewable workspace instead of failing the whole run.

## MCP

The MCP server calls the API. It does not connect directly to the database.

Primary tools:

- `opendinq_generate_profile`
- `opendinq_plan_profile_generation`
- `opendinq_generate_profile_ai`
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
