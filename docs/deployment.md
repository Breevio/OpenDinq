# Deployment

OpenDinq is a local-first monorepo with separate deployable API, web, and MCP entrypoints.

## Build

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

The TypeScript packages build into their own `dist/` directories. The root `dist/` directory is treated as a legacy generated path and is removed by `pnpm clean`.

## API Service

```bash
PORT=3011 pnpm start:api
```

Useful environment variables:

- `PORT`: API listen port. Defaults to `3011`.
- `DATABASE_URL`: optional Postgres persistence. When unset, the API uses the in-memory runtime.
- `OPENDINQ_AUTO_SEED`: set to `false` to disable demo profile seeding.
- `GITHUB_TOKEN`: optional token for higher public GitHub API limits.
- `OPEN_DINQ_*`: optional LLM and web-search configuration.

When `DATABASE_URL` is set, run migrations before starting the API:

```bash
pnpm db:generate
pnpm db:migrate
```

## Web Service

```bash
NEXT_PUBLIC_OPENDINQ_API_URL=http://localhost:3011 PORT=3012 pnpm start:web
```

The browser-facing API URL is compiled into the Next.js app, so set `NEXT_PUBLIC_OPENDINQ_API_URL` before `pnpm build` for hosted environments.

## MCP Service

```bash
OPENDINQ_API_URL=http://localhost:3011 pnpm start:mcp
```

The MCP server talks to the API only. It does not open a database connection.

## Development

Use the shared launcher for local development:

```bash
pnpm dev
```

The development scripts resolve workspace packages through the `development` export condition so source changes are picked up without requiring a production build first.
