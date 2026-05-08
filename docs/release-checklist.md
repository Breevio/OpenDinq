# Release Checklist

Before tagging a release:

- [ ] `./scripts/check.sh` passes
- [ ] `pnpm audit --audit-level high` passes
- [ ] `/health` returns ok
- [ ] `/import` returns 200
- [ ] `/discover` returns 200
- [ ] `/u/demo-agent-builder` returns 200
- [ ] Demo search returns `demo-agent-builder`
- [ ] `pnpm screenshots` succeeds
- [ ] README screenshots are up to date
- [ ] Known limitations are accurate
- [ ] Docker/Postgres status is documented honestly
- [ ] A `LICENSE` file exists before public open-source release

Suggested v0.1-alpha tag:

```bash
git add .
git commit -m "chore: prepare v0.1-alpha MVP release"
git tag v0.1.0-alpha
git push origin main --tags
```

Suggested release notes:

```md
# OpenDinq v0.1.0-alpha

This is the first public MVP of OpenDinq.

## What works

- GitHub-first/demo people profiles
- Evidence-backed cards
- Rule-based natural-language people search
- Search explanations with evidence
- Minimal web UI
- API health endpoint
- Experimental MCP package builds

## Limitations

- In-memory runtime by default
- Postgres runtime is experimental
- Rule-based search only
- GitHub-first only
- Docker/Postgres path is experimental
```
