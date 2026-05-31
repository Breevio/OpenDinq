# OpenDinq MCP Examples

These examples assume the OpenDinq API is running locally:

```bash
pnpm dev:api
```

Then use one of the JSON snippets in this directory with your MCP-compatible client.

If you are integrating directly with the API instead of an MCP client, send the user's raw natural-language request to:

```http
POST /api/profiles/agent-search
```

Example body:

```json
{
  "input": "Research elonmusk and return the strongest profile cards."
}
```

The API-backed agent planner chooses OpenDinq tool calls, executes them, and returns generated profile cards plus `profile`, `cards`, `searchResults`, `profileUrl`, `workspaceUrl`, `warnings`, and a tool-call trace.

Required environment:

```bash
OPENDINQ_API_URL=http://localhost:3011
```

For a fuller API/Web/MCP environment template, copy from:

```bash
examples/mcp/opendinq-agent.env.example
```

Exposed tools:

- `opendinq_agent_search`
- `opendinq_web_search`
- `opendinq_plan_profile_generation`
- `opendinq_resolve_profile_candidates`
- `opendinq_generate_profile_ai`
- `opendinq_import_github_profile`
- `opendinq_generate_profile`
- `opendinq_get_profile_run`
- `opendinq_search_people`
- `opendinq_get_profile`
- `opendinq_get_person_profile`
- `opendinq_get_evidence`
- `opendinq_list_cards`
- `opendinq_create_note_card`

The MCP server calls the OpenDinq API. It does not connect directly to Postgres.
