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
```

`PATCH /api/cards/:cardId` only accepts:

- `title`
- `contentMd`
- `visibility`
- `order`

