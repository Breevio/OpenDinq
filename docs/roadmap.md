# Roadmap

## v0.1-alpha

Status: complete.

- GitHub-first/demo people profiles
- Evidence-backed deterministic cards
- Rule-based natural-language people search
- Minimal web UI
- API health endpoint
- Experimental MCP package

## v0.2 - DB-Backed Runtime

Status: complete, except local Docker/Postgres migration verification is blocked until Docker is running.

- Store abstraction
- MemoryStore moved out of the API package
- PrismaStore for Postgres persistence
- Runtime mode selection through `DATABASE_URL`
- Persist imported profiles across API restarts

## v0.3 - Hybrid Search

Status: complete for the deterministic hybrid baseline.

- Keep rule-based search
- Add full-text search over profiles, artifacts, and cards
- Add an optional provider boundary for future vector search
- Preserve explanations and evidence refs

Still planned after this baseline:

- pgvector-backed semantic search
- embedding provider configuration
- persisted search indexes

## v0.4 - Multi-Source Ingestion

Status: complete for attach-to-existing-profile imports.

- Manual artifact import
- Personal website import
- OpenAlex
- arXiv
- ORCID

LinkedIn/X scraping remains out of scope.

Current limitation: these sources add evidence to an existing profile. GitHub remains the full profile bootstrap path.

## v0.5 - MCP-Native Workflow

Status: complete for the local API-backed MCP baseline.

- Harden MCP tool names and schemas
- Add richer evidence retrieval through MCP
- Improve Codex/Cursor/Claude Code setup docs
- Keep MCP tools API-backed rather than DB-backed
