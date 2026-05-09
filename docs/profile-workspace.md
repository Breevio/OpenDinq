# Profile Workspace

The profile workspace is the local-alpha curation surface for generated profiles.

Route:

```text
/u/:handle/workspace
```

It is not auth-protected yet. Treat it as a local development and product-alpha workflow, not as a secure private dashboard.

## Purpose

The workspace closes the loop after generation:

```text
Generate Profile -> Review Claims -> Curate Cards -> Publish -> Discover
```

## Panels

### Readiness

Readiness is a deterministic 0-100 score from:

- display name and headline
- source count
- claim count
- card count
- artifact count
- public cards
- evidence-backed claims

The checklist points users toward the next useful action.

### Sources

Sources show type, status, URL/input context, warnings, and imported source state.

### Claims Review

Claims are grouped by type and can be:

- `pending`
- `approved`
- `rejected`

Rejected claims are filtered from public approved-claim output and are not emphasized in Discover.

### Cards

The card editor lite supports:

- edit title
- edit markdown content
- change visibility
- move up/down
- expand evidence
- regenerate deterministic content from approved claims/artifacts
- create manual note cards

### Publish

Publishing is alpha-level product state:

- `draft`
- `published`

It is not an auth or permissions system. Public profile pages can still render in local alpha, but Discover can prefer published profiles as the product matures.
