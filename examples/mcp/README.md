# OpenDinq MCP Examples

These examples assume the OpenDinq API is running locally:

```bash
pnpm dev:api
```

Then use one of the JSON snippets in this directory with your MCP-compatible client.

Required environment:

```bash
OPENDINQ_API_URL=http://localhost:3001
```

Exposed tools:

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
