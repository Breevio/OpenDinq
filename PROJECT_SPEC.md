# OpenDINQ Project Spec

OpenDINQ is an evidence-backed public profile and people-search system.

MVP goal:

> Input a GitHub username, generate an evidence-backed profile and cards; input a natural-language query, return ranked people with explanations and evidence.

Non-goals for MVP:
- LinkedIn scraping.
- X scraping.
- Login-gated scholar scraping.
- Payments, credits, teams, admin dashboards.
- Browser automation or auto-contacting people.
- DINQ private API integration.

Primary objects:
- `Person`
- `IdentitySource`
- `Artifact`
- `Card`
- `SkillTag`
- `EvidenceRef`
- `SearchQuery`
- `SearchResult`

