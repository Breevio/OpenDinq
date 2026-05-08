# Profile Generator

The generator is the primary OpenDinq product flow.

```text
Generate Profile -> Cards -> Public Profile -> Discover
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

## Compatibility

`POST /api/import/github` still works. It wraps the generator with:

```json
{
  "sources": [{ "type": "github", "input": "..." }]
}
```

GitHub is a connector, not the product spine.
