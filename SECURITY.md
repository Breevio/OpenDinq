# Security

## Supported Versions

OpenDinq is currently a `v0.1-alpha` local MVP. Security fixes are handled on `main` until formal release branches exist.

## Reporting A Vulnerability

Do not open public issues for exploitable vulnerabilities. Report privately to the repository maintainers once the public repository is created.

## Current Security Posture

- No authentication is implemented in the MVP.
- The local API is intended for local development only.
- Do not expose the local API directly to the public internet.
- Do not commit real API keys, tokens, cookies, or scraped private data.
- The MVP intentionally avoids LinkedIn/X scraping, browser automation, and private DINQ APIs.

## Dependency Advisory Notes

`pnpm audit --audit-level high` must pass before release.

Known moderate advisories should either be fixed with safe patch/minor upgrades or documented here with rationale. As of this hardening pass, the PostCSS moderate advisory was addressed with a pnpm override to `postcss@8.5.10`.
