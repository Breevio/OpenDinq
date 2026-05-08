# DB Runtime

OpenDinq supports two runtime modes.

## MemoryStore

MemoryStore is the default when `DATABASE_URL` is not set.

It is useful for local demos, tests, and quick development. Imported profiles are lost when the API process restarts.

## PrismaStore

PrismaStore is selected when `DATABASE_URL` is set.

It persists:

- people
- identity sources
- artifacts
- profile generation runs
- profile sources
- profile claims
- cards

## Local Postgres

```bash
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
DATABASE_URL="postgresql://opendinq:opendinq@localhost:5432/opendinq" pnpm dev:api
```

## Verify Persistence

1. Start Postgres.
2. Run migrations.
3. Start the API with `DATABASE_URL`.
4. Generate a profile through `/generate` or `POST /api/profiles/generate`.
5. Stop and restart the API with the same `DATABASE_URL`.
6. Confirm `/api/people/:handle` still returns the profile.
7. Confirm `/api/search?q=<matching query>` returns the profile.

## Current Limitations

- DB-backed runtime is still alpha.
- There is no auth or ownership model.
- There is no production migration policy yet.
- Search is not a production vector index.
- Docker/Postgres must be verified in the local environment before release.

