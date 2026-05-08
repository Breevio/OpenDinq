# Release Checklist

Before tagging a release:

- [ ] `./scripts/check.sh` passes
- [ ] `pnpm audit --audit-level high` passes
- [ ] `pnpm db:generate` passes
- [ ] `pnpm db:validate` passes
- [ ] `DATABASE_URL=... pnpm verify:db` passes when Postgres is available
- [ ] `/health` returns ok
- [ ] `/generate` returns 200
- [ ] `/discover` returns 200
- [ ] `/u/demo-agent-builder` returns 200
- [ ] Manual-only profile generation works from `/generate`
- [ ] Demo search returns `demo-agent-builder`
- [ ] MemoryStore verification passes
- [ ] PrismaStore/Postgres verification passes, or release notes clearly say it is pending local Docker/Postgres availability
- [ ] MCP package build and tests pass
- [ ] Playwright smoke passes
- [ ] `pnpm screenshots` succeeds
- [ ] README screenshots are up to date
- [ ] Known limitations are accurate
- [ ] Docker/Postgres status is documented honestly
- [ ] A `LICENSE` file exists before public open-source release
