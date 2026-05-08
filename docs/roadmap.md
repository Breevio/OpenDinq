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

Status: in progress.

- Store abstraction
- MemoryStore moved out of the API package
- PrismaStore for Postgres persistence
- Runtime mode selection through `DATABASE_URL`
- Persist imported profiles across API restarts

## v0.3 - Hybrid Search

Planned.

- Keep rule-based search
- Add full-text search
- Add vector search when embeddings are configured
- Preserve explanations and evidence refs

## v0.4 - Multi-Source Ingestion

Planned.

- Manual artifact import
- Personal website import
- OpenAlex
- arXiv
- ORCID

LinkedIn/X scraping remains out of scope.

## v0.5 - MCP-Native Workflow

Planned.

- Harden MCP tool names and schemas
- Add richer evidence retrieval through MCP
- Improve Codex/Cursor/Claude Code setup docs
- Keep MCP tools API-backed rather than DB-backed
