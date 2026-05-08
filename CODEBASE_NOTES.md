# CODEBASE_NOTES.md

## PeopleHub

Useful:
- Natural-language people search flow.
- Query parser -> cache -> data source -> results.
- Research report concept.
- PostgreSQL plus cache as the persistence backbone.

Do not copy:
- LinkedIn scraping as the default source.
- Bright Data as a required path.
- Product positioning or UI style.

OpenDinq equivalent:
- GitHub/OpenAlex/arXiv/website connectors.
- Evidence-backed cards.
- Search result explanation with cited artifacts.

Risks:
- Scraping-heavy flows create compliance and stability risk.
- Query parsing can hide weak retrieval if explanations are not evidence-backed.

TODOs generated:
- Build deterministic GitHub ingestion first.
- Add cached connector responses behind repository boundaries.
- Keep research reports optional until cards and search are reliable.

## NextCRM

Useful:
- Next.js, PostgreSQL, Prisma, AI, vector search, and MCP-oriented production structure.
- Docker-first local development.
- Clear separation between app, persistence, search, and enrichment modules.

Do not copy:
- CRM, invoicing, email, and project-management modules.
- Full application complexity before OpenDINQ has a working MVP.

OpenDinq equivalent:
- `apps/web` for profile/search UI.
- `apps/api` for local HTTP API.
- `packages/db` for Prisma repositories.
- `packages/search` for rule-based search first, vector search later.
- `apps/mcp` for agent-facing tools in v0.2.

Risks:
- Importing a CRM architecture too early would overfit OpenDINQ to enterprise workflows.

TODOs generated:
- Keep package boundaries explicit.
- Add pgvector only after rule-based search has tests and seed data.

## DinqBot

Useful:
- MCP tools that let coding agents create and manage cards.
- Tool names shaped around user intent: import, search, get profile, list cards, create note card.

Do not copy:
- DINQ private API assumptions.
- Branding, copy, or hosted service behavior.

OpenDinq equivalent:
- `import_github_profile`.
- `search_people`.
- `get_person_profile`.
- `list_cards`.
- `create_note_card`.

Risks:
- MCP can become a second product surface before the core API is stable.

TODOs generated:
- Implement MCP only after HTTP API and cards exist.
- Make MCP talk to OpenDINQ API instead of direct DB access.

## Twenty

Useful:
- Long-term object model thinking: person, artifact, card, views, workflows, agents.
- Mature CRM-style extensibility ideas.

Do not copy:
- Heavy Nx/NestJS/BullMQ architecture for MVP.
- Full object customization system.

OpenDinq equivalent:
- Simple typed objects now.
- Workflow and agent abstractions later.

Risks:
- Copying mature CRM complexity would slow the first usable slice.

TODOs generated:
- Keep `Person`, `Artifact`, `Card`, and `EvidenceRef` clean and stable.
- Revisit workflow and view extensibility after search and import are useful.

