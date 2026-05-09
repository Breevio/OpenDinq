# Card System

Cards are the primary public profile objects in OpenDinq.

Generated cards are built from claims, artifacts, and evidence refs. Manual note cards are user-provided and carry manual evidence.

## Card Types

- `summary`
- `skills`
- `works`
- `research`
- `timeline`
- `note`

## Fields

Cards include:

- `id`
- `personId`
- `type`
- `title`
- `contentMd`
- `evidence`
- `sourceIds`
- `claimIds`
- `confidence`
- `visibility`
- `order`
- `createdAt`
- `updatedAt`

Generated card `dataJson` may also include `qualityScore`, `evidenceCount`, `generatedFromClaimIds`, and `generatedFromArtifactIds`.

## Ordering

Default public order:

1. Summary
2. Skills
3. Works
4. Research
5. Timeline
6. Manual notes

## Visibility

`public` and `private` cards are stored. `hidden` cards are excluded from public profile and public card list responses.

There is no auth or ownership model yet, so visibility is local runtime behavior, not a security boundary.

## APIs

```text
GET   /api/people/:handle/cards
PATCH /api/cards/:cardId
POST  /api/people/:handle/cards/manual-note
POST  /api/cards/:cardId/regenerate
```

`PATCH /api/cards/:cardId` only accepts:

- `title`
- `contentMd`
- `visibility`
- `order`

`POST /api/cards/:cardId/regenerate` rebuilds the card deterministically from current approved claims, artifacts, and evidence. It preserves the card type and does not invent unsupported claims.

## Quality Rules

- Summary cards use top approved/high-quality claims and strongest evidence themes.
- Skill cards group deduped skills with confidence and evidence sources.
- Works cards rank artifacts by evidence relevance, stars/forks, recency, claim linkage, and manual importance.
- Research cards require research-area claims or paper-like artifacts.
- Timeline cards require dated artifacts.
- Manual note cards preserve user-provided text and attach manual evidence.

Optional LLM rewrite is experimental and evidence-constrained. If validation fails, deterministic card content is retained.

## Workspace Behavior

The profile workspace shows all cards, including hidden and private cards. Public profile responses exclude hidden cards.

The card editor lite supports:

- title edits
- markdown content edits
- visibility changes
- move up/down ordering
- evidence expansion
- deterministic regeneration
- manual note creation
