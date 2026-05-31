<p align="center">
  <img src="./docs/assets/opendinq-logo.png" alt="OpenDinq" width="720" />
</p>

<p align="center">
  <strong>Evidence-backed AI profiles for explainable people discovery.</strong>
</p>

<p align="center">
  <a href="#what-it-does">What it does</a> ·
  <a href="#start">Start</a> ·
  <a href="#use-it">Use it</a> ·
  <a href="#more-docs">More docs</a> ·
  <a href="#acknowledgements">Acknowledgements</a>
</p>

# OpenDinq

## What it does

OpenDinq helps you turn public information about a person into a reviewable profile with evidence, claims, and cards.

## Start

Install [Node.js 22+](https://nodejs.org/), then run:

```bash
git clone https://github.com/Breevio/OpenDinq.git
cd OpenDinq
corepack enable
pnpm install
pnpm start
```

Open the web address shown in your terminal.

`pnpm dev` is the recommended local entrypoint for full API + web development. It now fails fast on port conflicts, reports which service exited, and shuts down both child processes cleanly on `Ctrl+C`.

If GitHub imports fall back into review mode because of anonymous API rate limits, restart local development with a token:

```bash
GITHUB_TOKEN=YOUR_TOKEN pnpm dev
```

Use the single-service commands only when you intentionally want isolated debugging:

```bash
pnpm dev:api
pnpm dev:web
```

## Use it

1. Click **Generate Profile**.
2. Type a person, username, public link, or short request.
3. Click **Search & generate profile**.
4. Review the generated evidence, claims, and cards.
5. Publish the profile when it looks right.

You can also use **Discover** to search profiles that already exist.

## What you get

- A profile workspace for review.
- Evidence-backed claims.
- Curated profile cards.
- A public profile page.
- Searchable people results.

## More docs

- [Architecture](./docs/architecture.md)
- [Profile Generator](./docs/profile-generator.md)
- [Profile Workspace](./docs/profile-workspace.md)
- [Evidence Model](./docs/evidence-model.md)
- [Card System](./docs/card-system.md)
- [Discover](./docs/discover.md)
- [DB Runtime](./docs/db-runtime.md)
- [MCP examples](./examples/mcp/README.md)

## Acknowledgements

OpenDinq acknowledges related open-source projects and references that inform agent-oriented people discovery workflows, including [NexAU](https://github.com/nex-agi/NexAU) and [pepolehub](https://github.com/brightdata/pepolehub).
