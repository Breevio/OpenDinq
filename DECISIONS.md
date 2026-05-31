# Decisions

## 0001 - Clean-room repository

OpenDinq starts as a new repository instead of a fork.

Reason:
- The closest product references depend on assumptions OpenDinq should not inherit, especially scraping-heavy ingestion.
- The MVP needs a small, auditable object model more than a copied application shell.

## 0002 - GitHub first

GitHub is the first connector.

Reason:
- Public API access is stable enough for an MVP.
- Repositories provide direct evidence for code, language, topic, recency, and impact signals.

## 0003 - Deterministic before LLM

Cards and search start deterministic.

Reason:
- Evidence coverage and repeatability matter more than fluent generation in the first slice.
- LLM features can be added after tests define expected behavior.

