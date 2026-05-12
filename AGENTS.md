# OpenDinq Agent Instructions

## Project Rules

- OpenDinq is a clean-room implementation inspired by public product patterns. Do not copy code, branding, private APIs, layouts, or assets from DINQ or reference repositories.
- Keep the MVP evidence-backed: generated profiles, cards, and search results must preserve source evidence.
- Use only public or user-authorized data sources. GitHub is the first ingestion source.
- Do not add LinkedIn/X/browser scraping without an explicit product and compliance decision.
- Keep the API local-first and unauthenticated unless auth is explicitly requested.
- Prefer small deterministic modules over broad agent/LLM abstractions; LLM features belong behind package boundaries.
- Keep changes scoped. State assumptions before non-trivial work and ask when requirements conflict.
- Do not commit API keys, model keys, tokens, cookies, scraped private data, or generated secrets.

## Validation

- Run `./scripts/check.sh` before claiming implementation work is complete.
- For UI changes, start `pnpm dev:api` and `pnpm dev:web`, then verify `/import`, `/discover`, and at least one `/u/[handle]` profile.
- For DB changes, run `DATABASE_URL=... pnpm --filter @opendinq/db exec prisma validate --schema prisma/schema.prisma`; run migrations against local Postgres when Docker is available.
- For MCP changes, run `pnpm --filter @opendinq/mcp test` and `pnpm --filter @opendinq/mcp build`.

## MVP Scope

- In scope: GitHub import, deterministic cards, evidence-backed search, local API/Web, demo seed data, MCP tools that call the API.
- Out of scope: payments, auth, teams, private DINQ APIs, LinkedIn/X scraping, automatic outreach, production persistence in the API runtime.
