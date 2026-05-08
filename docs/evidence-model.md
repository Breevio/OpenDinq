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
