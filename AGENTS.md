# OpenDinq Agent Instructions

ASSUMPTIONS I'M MAKING:
1. OpenDinq is a clean-room implementation inspired by public product patterns, not a fork of any reference codebase.
2. The MVP is evidence-backed profile generation and natural-language people search from public or authorized sources.
3. GitHub is the first ingestion source; LinkedIn/X/browser scraping are out of scope for the MVP.

Core rules:
- State assumptions before non-trivial changes.
- Ask when requirements conflict instead of guessing.
- Keep changes scoped to the requested task.
- Prefer deterministic, evidence-backed behavior before LLM-generated output.
- Do not copy code, branding, private APIs, layouts, or assets from DINQ or reference repositories.
- Run `./scripts/check.sh` before claiming implementation work is complete.
- Do not commit API keys, model keys, tokens, cookies, scraped private data, or generated secrets.
- Do not add LinkedIn/X/browser scraping without a new explicit product and compliance decision.
- Use public or user-authorized data sources only; every generated card/search result must preserve evidence.
- Keep the API local-first and unauthenticated for the MVP unless auth is explicitly requested.
- Prefer small deterministic modules over broad agent/LLM abstractions; LLM features belong behind package boundaries.
- If Google Drive sync is slow, work in a local temporary copy, then sync source files back while excluding `node_modules`, `.next`, `dist`, and `*.tsbuildinfo`.

Validation checklist:
1. Run `./scripts/check.sh`.
2. For UI changes, start `pnpm dev:api` and `pnpm dev:web`, then verify `/import`, `/discover`, and at least one `/u/[handle]` profile.
3. For DB changes, run `DATABASE_URL=... pnpm --filter @opendinq/db exec prisma validate --schema prisma/schema.prisma`; run migrations against local Postgres when Docker is available.
4. For MCP changes, run `pnpm --filter @opendinq/mcp test` and `pnpm --filter @opendinq/mcp build`.

Current MVP boundaries:
- In scope: GitHub import, deterministic cards, evidence-backed search, local API/Web, demo seed data, MCP tools that call the API.
- Out of scope: payments, auth, teams, browser automation, private DINQ APIs, LinkedIn/X scraping, automatic outreach, production persistence in the API runtime.
