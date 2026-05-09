# Profile Generator

The generator is the primary OpenDinq product flow.

```text
Generate Profile -> Workspace -> Cards -> Public Profile -> Discover
```

## Input

`POST /api/profiles/generate-ai` accepts one input and plans sources before generation.

```json
{
  "input": "Generate a profile from https://github.com/torvalds",
  "reviewPlan": false
}
```

`POST /api/profiles/plan` previews the plan without persisting a profile.

`POST /api/profiles/generate` remains available for advanced deterministic source entry. It accepts identity fields and one or more explicit sources.

```json
{
  "displayName": "Demo Agent Builder",
  "handle": "demo-agent-builder",
  "headline": "AI agent engineer",
  "sources": [
    { "type": "github", "input": "demo-agent-builder" },
    { "type": "website", "input": "https://example.com" },
    {
      "type": "manual",
      "input": {
        "title": "Built MCP tools",
        "url": "https://example.com/project",
        "note": "Built MCP tools for profile automation."
      }
    }
  ]
}
```

Supported source types:

- `github`
- `website`
- `openalex`
- `arxiv`
- `orcid`
- `manual`

## LLM Planning

Enable with:

```bash
OPEN_DINQ_ENABLE_LLM_GENERATION=true
OPEN_DINQ_LLM_PROVIDER=openai-compatible
OPEN_DINQ_LLM_MODEL=gpt-4.1-mini
OPEN_DINQ_LLM_API_KEY=...
OPEN_DINQ_LLM_CHAT_COMPLETIONS_URL=https://api.openai.com/v1/chat/completions # optional
OPEN_DINQ_LLM_BASE_URL=https://api.openai.com/v1 # optional
OPEN_DINQ_LLM_TIMEOUT_MS=90000 # optional
OPEN_DINQ_LLM_MAX_TOKENS=1200 # optional
```

The planner outputs strict JSON with intent, confidence, subject, explicit sources, user-provided claims, missing evidence, warnings, and questions. OpenDinq validates the JSON and rejects hallucinated URLs that were not present in the input.

If no LLM is configured, the LLM times out, or the provider returns unusable JSON, OpenDinq returns `llmUsed: false` and uses local fallback planning. Natural-language-only input becomes a manual evidence seed and still creates a reviewable workspace. User-provided claims are not verified evidence.

## Output

The response includes the run id, generated handle, card count, artifact count, claim count, and warnings.

Warnings do not fail the run by default. Weak evidence and connector failures produce `needs_review`, not hard failure. GitHub rate limits should create a review workspace with source warnings; add `GITHUB_TOKEN` for stronger imports.

After generation, the web flow sends users to `/u/:handle/workspace` first. The workspace shows sources, generated claims, cards, readiness, publish status, and links to the public profile and Discover.

## Claim Quality Pipeline

Connector and manual claims pass through:

```text
raw claims -> normalized claims -> deduped claims -> ranked claims -> quality-scored claims
```

The pipeline trims claim text, rejects empty or unsupported claim types, clamps confidence, normalizes evidence refs, dedupes exact/case-insensitive/same-evidence claims, merges evidence refs, prefers higher confidence, computes `qualityScore`, and ranks approved claims first. Rejected claims are excluded from public and Discover use.

## Next Steps After Generation

Recommended product path:

1. Review the generation run summary.
2. Open the workspace.
3. Approve, edit, or reject claims.
4. Edit, hide, reorder, or regenerate cards.
5. Publish the profile.
6. Search Discover with an evidence-backed query.

## Compatibility

`POST /api/import/github` still works. It wraps the generator with:

```json
{
  "sources": [{ "type": "github", "input": "..." }]
}
```

GitHub is a connector, not the product spine.

## Optional Rewrite

If `OPEN_DINQ_ENABLE_LLM_REWRITE=true` and an OpenAI-compatible API key is configured, generated cards may be rewritten with only approved claims and evidence refs. Rewrite failure never blocks profile generation.
