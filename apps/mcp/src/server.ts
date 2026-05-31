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
    "opendinq_generate_profile",
    {
      description: "Generate an OpenDinq profile from explicit public or user-provided sources when the agent already knows which sources to import.",
      inputSchema: {
        displayName: z.string().optional().describe("Person display name"),
        handle: z.string().optional().describe("OpenDinq profile handle"),
        headline: z.string().optional().describe("Optional profile headline"),
        sources: z.array(
          z.union([
            z.object({ type: z.literal("github"), input: z.string().min(1) }),
            z.object({ type: z.literal("website"), input: z.string().min(1) }),
            z.object({ type: z.literal("openalex"), input: z.string().min(1) }),
            z.object({ type: z.literal("arxiv"), input: z.string().min(1) }),
            z.object({ type: z.literal("orcid"), input: z.string().min(1) }),
            z.object({
              type: z.literal("manual"),
              input: z.object({
                title: z.string().optional(),
                url: z.string().optional(),
                note: z.string().optional(),
                description: z.string().optional()
              })
            })
          ])
        ).min(1)
      }
    },
    async (input) => textResult(await tools.opendinq_generate_profile(input))
  );

  server.registerTool(
    "opendinq_agent_search",
    {
      description: "Run the full OpenDinq agent-search workflow for one natural-language user request: plan tool calls, search public candidates, generate an evidence-backed profile, return profile/cards/workspace/search results, and include tool-call traces.",
      inputSchema: {
        input: z.string().min(1).describe("Natural-language request such as a person name, public source, or research instruction")
      }
    },
    async (input) => textResult(await tools.opendinq_agent_search(input))
  );

  server.registerTool(
    "opendinq_web_search",
    {
      description: "Search for public web evidence for a person/profile request. Use this before generation when the user gives only a natural-language request; returned URLs can be imported as website evidence.",
      inputSchema: {
        input: z.string().min(1).optional().describe("Natural-language web research request"),
        query: z.string().min(1).optional().describe("Alias for input")
      }
    },
    async (input) => textResult(await tools.opendinq_web_search(input))
  );

  server.registerTool(
    "opendinq_plan_profile_generation",
    {
      description: "Plan a natural-language profile generation request without persisting anything. Use this first when an agent wants to inspect the proposed public-source plan.",
      inputSchema: {
        input: z.string().min(1).describe("Single profile generation input")
      }
    },
    async (input) => textResult(await tools.opendinq_plan_profile_generation(input))
  );

  server.registerTool(
    "opendinq_generate_profile_ai",
    {
      description: "Research one URL, id, username, person name, or natural-language request through the API planner, generate evidence-backed claims and cards, and return run counts plus profile/workspace URLs.",
      inputSchema: {
        input: z.string().min(1).describe("Single profile generation input"),
        reviewPlan: z.boolean().optional().describe("Whether the caller wants the plan returned for review")
      }
    },
    async (input) => textResult(await tools.opendinq_generate_profile_ai(input))
  );

  server.registerTool(
    "opendinq_resolve_profile_candidates",
    {
      description: "Search public OpenDinq connectors for candidate people or source records before generating. Use this for natural-language person research so the agent can pick GitHub, OpenAlex, ORCID, arXiv, website, or existing-profile evidence instead of relying on manual claims.",
      inputSchema: {
        input: z.string().min(1).optional().describe("Natural-language person request, source URL, handle, or name"),
        query: z.string().min(1).optional().describe("Alias for input")
      }
    },
    async (input) => textResult(await tools.opendinq_resolve_profile_candidates(input))
  );

  server.registerTool(
    "opendinq_get_profile_run",
    {
      description: "Get status and counts for a profile generation run.",
      inputSchema: {
        runId: z.string().min(1).describe("Profile generation run id")
      }
    },
    async (input) => textResult(await tools.opendinq_get_profile_run(input))
  );

  server.registerTool(
    "opendinq_import_github_profile",
    {
      description: "Import a public GitHub profile into OpenDinq and generate deterministic cards.",
      inputSchema: {
        input: z.string().min(1).describe("GitHub username or profile URL")
      }
    },
    async (input) => textResult(await tools.opendinq_import_github_profile(input))
  );

  server.registerTool(
    "opendinq_search_people",
    {
      description: "Search existing OpenDinq profiles with a natural-language query. Use after generation to find ranked people with explanations and evidence.",
      inputSchema: {
        query: z.string().min(1).describe("Natural-language people search query")
      }
    },
    async (input) => textResult(await tools.opendinq_search_people(input))
  );

  server.registerTool(
    "opendinq_get_profile_workspace",
    {
      description: "Get local-alpha workspace data for an OpenDinq profile.",
      inputSchema: {
        handle: z.string().min(1).describe("OpenDinq person handle")
      }
    },
    async (input) => textResult(await tools.opendinq_get_profile_workspace(input))
  );

  server.registerTool(
    "opendinq_get_profile",
    {
      description: "Get the generated public profile, including sources, artifacts, claims, and cards for the user-facing result.",
      inputSchema: {
        handle: z.string().min(1).describe("OpenDinq person handle")
      }
    },
    async (input) => textResult(await tools.opendinq_get_profile(input))
  );

  server.registerTool(
    "opendinq_get_person_profile",
    {
      description: "Get the generated public profile, including sources, artifacts, claims, and cards for the user-facing result.",
      inputSchema: {
        handle: z.string().min(1).describe("OpenDinq person handle")
      }
    },
    async (input) => textResult(await tools.opendinq_get_person_profile(input))
  );

  server.registerTool(
    "opendinq_get_evidence",
    {
      description: "Get sources, artifacts, and card evidence refs for an OpenDinq person.",
      inputSchema: {
        handle: z.string().min(1).describe("OpenDinq person handle")
      }
    },
    async (input) => textResult(await tools.opendinq_get_evidence(input))
  );

  server.registerTool(
    "opendinq_list_cards",
    {
      description: "List generated and manual cards for an OpenDinq person when the agent needs card-only output.",
      inputSchema: {
        handle: z.string().min(1).describe("OpenDinq person handle")
      }
    },
    async (input) => textResult(await tools.opendinq_list_cards(input))
  );

  server.registerTool(
    "opendinq_create_note_card",
    {
      description: "Create a manual note card for an existing OpenDinq person.",
      inputSchema: {
        handle: z.string().min(1).describe("OpenDinq person handle"),
        title: z.string().min(1).describe("Note card title"),
        contentMd: z.string().min(1).describe("Markdown note content")
      }
    },
    async (input) => textResult(await tools.opendinq_create_note_card(input))
  );

  server.registerTool(
    "opendinq_update_claim",
    {
      description: "Update a profile claim review status or editable fields.",
      inputSchema: {
        claimId: z.string().min(1),
        patch: z.object({
          text: z.string().optional(),
          type: z.enum(["skill", "role", "project", "research_area", "achievement", "affiliation", "link", "summary"]).optional(),
          confidence: z.number().min(0).max(1).optional(),
          status: z.enum(["pending", "approved", "rejected"]).optional()
        })
      }
    },
    async (input) => textResult(await tools.opendinq_update_claim(input))
  );

  server.registerTool(
    "opendinq_update_card",
    {
      description: "Update a card title, content, visibility, or order.",
      inputSchema: {
        cardId: z.string().min(1),
        patch: z.object({
          title: z.string().optional(),
          contentMd: z.string().optional(),
          visibility: z.enum(["public", "private", "hidden"]).optional(),
          order: z.number().optional()
        })
      }
    },
    async (input) => textResult(await tools.opendinq_update_card(input))
  );

  server.registerTool(
    "opendinq_regenerate_card",
    {
      description: "Regenerate a card deterministically from approved claims and artifacts.",
      inputSchema: {
        cardId: z.string().min(1)
      }
    },
    async (input) => textResult(await tools.opendinq_regenerate_card(input))
  );

  server.registerTool(
    "opendinq_publish_profile",
    {
      description: "Set a profile's local-alpha public status.",
      inputSchema: {
        handle: z.string().min(1),
        publicStatus: z.enum(["draft", "published"])
      }
    },
    async (input) => textResult(await tools.opendinq_publish_profile(input))
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
