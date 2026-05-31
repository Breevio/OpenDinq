#!/usr/bin/env bash
set -euo pipefail

CI=true pnpm install --frozen-lockfile --ignore-scripts --optimistic-repeat-install --reporter=append-only
pnpm typecheck
pnpm test
pnpm lint
pnpm build
