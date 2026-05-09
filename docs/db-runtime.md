# DB Runtime

OpenDinq supports two runtime modes.

## MemoryStore

MemoryStore is the default when `DATABASE_URL` is not set.

It is non-persistent and useful for local demos, tests, and quick development. Imported profiles are lost when the API process restarts.

## PrismaStore

PrismaStore is selected when `DATABASE_URL` is set.

It is persistent and requires a reachable Postgres database plus generated Prisma Client files.

It persists:

- people
- identity sources
- artifacts
- profile generation runs
- profile sources
- profile claims
- cards
- claim review status
- card visibility and order
- profile draft/published status

## Local Postgres

```bash
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
DATABASE_URL="postgresql://opendinq:opendinq@localhost:5432/opendinq" pnpm verify:db
DATABASE_URL="postgresql://opendinq:opendinq@localhost:5432/opendinq" pnpm dev:api
```

## Verify DB Runtime

`pnpm verify:db` requires `DATABASE_URL`.

It verifies:

- Prisma connection
- profile generation through the API service layer
- profile run persistence
- profile sources, artifacts, claims, and cards
- workspace summary
- claim approval/rejection
- manual note cards
- card edit, regenerate, visibility, and order
- profile publish status
- hidden card public filtering
- DB-backed search
- evidence retrieval
- profile/search persistence after Prisma reconnect

## Manual Verification Checklist

1. Start Postgres.
2. Run migrations.
3. Run `DATABASE_URL=... pnpm verify:db`.
4. Start the API and web app with `DATABASE_URL`.
5. Generate a profile through `/generate`.
6. Stop and restart the API with the same `DATABASE_URL`.
7. Confirm `/u/:handle` still renders the profile.
8. Confirm `/discover` finds the profile.
9. Confirm `/u/:handle/workspace` can edit claims/cards and publish the profile.

## Current Verification Status

The repository includes an automated DB runtime verification script. In the current authoring environment, Docker was unavailable, so full Postgres E2E verification remains pending until local Docker/Postgres is available.

## Current Limitations

- DB-backed runtime is still alpha.
- There is no auth or ownership model.
- Workspace and publishing are local-alpha product state, not access control.
- There is no production migration policy yet.
- Search is not a production vector index.
- Docker/Postgres verification depends on local Docker availability.
