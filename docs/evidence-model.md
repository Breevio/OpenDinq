# Evidence Model

OpenDinq generates profiles from evidence, not from unsupported text.

## Core Objects

`ProfileGenerationRun`

Tracks one generation request, its status, source summaries, warnings, and errors.

`ProfileSource`

Tracks one input source in a run. A source can succeed, fail, or need review.

`Artifact`

A normalized public object such as a repo, paper, project, website, post, or note.

`ProfileClaim`

A claim inferred from sources and artifacts. Examples:

- skill
- role
- project
- research_area
- achievement
- affiliation
- link
- summary

Every claim has confidence and evidence refs.

Claims also have a review status:

- `pending`
- `approved`
- `rejected`

Approved claims are preferred in public profile and Discover output. Rejected claims remain stored for review history, but should not be shown as public approved claims or used prominently in search.

`Card`

A public profile object generated from claims and artifacts. Non-manual generated cards require evidence.

## Normalized Source Bundle

Each connector is adapted into:

```text
NormalizedSourceBundle
  source
  artifacts
  claims
  warnings
```

This keeps connector-specific data outside the main product flow.

## Card Evidence

Generated cards include:

- `evidence`
- `sourceIds` where available
- `claimIds` where available
- `confidence` where available
- `visibility`
- `order`

Cards should support claims. Artifacts support cards.

## Evidence UX

Evidence refs are shown in:

- public profile card drawers
- workspace claim review
- card editor lite
- Discover result cards

Each evidence ref should be readable without exposing raw connector JSON.
