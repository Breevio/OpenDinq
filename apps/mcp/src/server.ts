import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { createOpenDinqApiClient, type OpenDinqApiClient } from "./api-client.js";
import { createToolHandlers, MCP_TOOL_PLAN, textResult } from "./tools.js";

export { MCP_TOOL_PLAN };

export function createOpenDinqMcpServer(client: OpenDinqApiClient = createOpenDinqApiClient()) {
  const server = new McpServer({
    name: "opendinq",
    version: "0.1.0"
  });
  const tools = createToolHandlers(client);

  server.registerTool(
    "import_github_profile",
    {
      description: "Import a public GitHub profile into OpenDINQ and generate deterministic cards.",
      inputSchema: {
        input: z.string().min(1).describe("GitHub username or profile URL")
      }
    },
    async (input) => textResult(await tools.import_github_profile(input))
  );

  server.registerTool(
    "search_people",
    {
      description: "Search OpenDINQ people with a natural-language query and return explanations plus evidence.",
      inputSchema: {
        query: z.string().min(1).describe("Natural-language people search query")
      }
    },
    async (input) => textResult(await tools.search_people(input))
  );

  server.registerTool(
    "get_person_profile",
    {
      description: "Get an OpenDINQ profile, including sources, artifacts, and cards.",
      inputSchema: {
        handle: z.string().min(1).describe("OpenDINQ person handle")
      }
    },
    async (input) => textResult(await tools.get_person_profile(input))
  );

  server.registerTool(
    "list_cards",
    {
      description: "List generated and manual cards for an OpenDINQ person.",
      inputSchema: {
        handle: z.string().min(1).describe("OpenDINQ person handle")
      }
    },
    async (input) => textResult(await tools.list_cards(input))
  );

  server.registerTool(
    "create_note_card",
    {
      description: "Create a manual note card for an existing OpenDINQ person.",
      inputSchema: {
        handle: z.string().min(1).describe("OpenDINQ person handle"),
        title: z.string().min(1).describe("Note card title"),
        contentMd: z.string().min(1).describe("Markdown note content")
      }
    },
    async (input) => textResult(await tools.create_note_card(input))
  );

  return server;
}

async function main() {
  const server = createOpenDinqMcpServer();
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
