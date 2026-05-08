# TASKS.md

## Milestone 0 - Reference analysis
- [x] Create CODEBASE_NOTES.md
- [x] Summarize PeopleHub pipeline
- [x] Summarize NextCRM architecture
- [x] Summarize DinqBot MCP tools
- [x] Decide what OpenDinq will not copy

## Milestone 1 - Core scaffold
- [x] pnpm workspace
- [x] apps/web
- [x] apps/api
- [x] packages/core
- [x] packages/db
- [x] packages/connectors
- [x] packages/search
- [x] packages/cards
- [x] packages/shared
- [x] scripts/check.sh
- [x] smoke tests

## Milestone 2 - Domain model
- [x] Person schema
- [x] IdentitySource schema
- [x] Artifact schema
- [x] Card schema
- [x] EvidenceRef schema
- [x] SearchQuery schema
- [x] SearchResult schema
- [x] validation tests

## Milestone 3 - GitHub ingestion
- [x] parse GitHub URL
- [x] fetch GitHub user
- [x] fetch GitHub repos
- [x] normalize user to Person
- [x] normalize repos to Artifacts
- [x] fixture tests
- [x] rate-limit error handling

## Milestone 4 - Persistence
- [x] Prisma schema
- [x] migrations
- [x] upsert person
- [x] upsert source
- [x] upsert artifacts
- [x] save/list cards
- [x] seed command

## Milestone 5 - Cards
- [x] summary card
- [x] GitHub card
- [x] skills card
- [x] evidence refs
- [x] deterministic tests

## Milestone 6 - Search
- [x] parse query
- [x] match skills
- [x] match artifacts
- [x] rank people
- [x] explain matches
- [x] evidence-backed results
- [x] seed search tests

## Milestone 7 - API
- [x] POST /api/import/github
- [x] GET /api/people/:handle
- [x] GET /api/search
- [x] GET /api/cards/:handle
- [x] zod validation
- [x] typed errors

## Milestone 8 - Web UI
- [x] /import
- [x] /u/[handle]
- [x] /discover
- [x] evidence snippets
- [x] card rendering

## Milestone 9 - MCP
- [x] MCP server
- [x] import_github_profile tool
- [x] search_people tool
- [x] get_person_profile tool
- [x] list_cards tool
- [x] create_note_card tool
- [x] Codex/Cursor/Claude config examples

## Milestone 10 - Polish
- [x] README quickstart
- [x] demo seed data
- [x] screenshots
- [x] Docker quickstart
- [x] AGENTS.md hardening

## Milestone 11 - v0.2 DB-backed runtime
- [x] Add OpenDinqStore interface
- [x] Move API memory data handling into MemoryStore
- [x] Add PrismaStore backed by the existing Prisma schema
- [x] Use MemoryStore by default when DATABASE_URL is missing
- [x] Use PrismaStore when DATABASE_URL is present
- [x] Preserve public API response shapes
- [x] Keep demo seed working in MemoryStore mode
- [x] Add MemoryStore tests
- [x] Add isolated PrismaStore tests
- [x] Update README runtime mode docs
- [ ] Verify Docker/Postgres migration locally; currently blocked because the Docker daemon is not running in this environment

## Milestone 12 - v0.3 hybrid search
- [x] Keep rule-based search as the deterministic fallback
- [x] Add a search provider interface
- [x] Add full-text style scoring over profiles, cards, and artifacts
- [x] Add optional vector search provider boundary
- [x] Preserve evidence and explanations for every result
- [x] Add search evaluation fixtures

## Milestone 13 - v0.4 multi-source ingestion
- [ ] Add manual artifact import
- [ ] Add personal website import
- [ ] Add OpenAlex connector
- [ ] Add arXiv connector
- [ ] Add ORCID connector
- [ ] Keep LinkedIn/X scraping out of scope

## Milestone 14 - v0.5 MCP-native workflow
- [ ] Harden MCP tool schemas
- [ ] Add richer evidence retrieval through MCP
- [ ] Keep MCP tools API-backed
- [ ] Add Codex/Cursor/Claude Code setup verification notes
