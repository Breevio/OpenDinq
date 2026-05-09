# Profile Generator

The generator is the primary OpenDinq product flow.

```text
Generate Profile -> Workspace -> Cards -> Public Profile -> Discover
```

## Input

`POST /api/profiles/generate` accepts identity fields and one or more sources.

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

## Output

The response includes the run id, generated handle, card count, artifact count, claim count, and warnings.

Warnings do not always fail the run. If at least one source produces useful evidence, the run can complete with `needs_review`.

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
