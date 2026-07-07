#!/usr/bin/env bun
/**
 * MCP server for Dial Up Deploy
 * Provides conversational interface to manage deployed sites
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import { DeployApiClient } from "./client.js";
import { parseCustomDomains } from "@keithk/deploy-core";

// Read configuration from environment
const API_URL = process.env.API_URL || "https://admin.keith.is";
const SESSION_TOKEN = process.env.SESSION_TOKEN;

if (!SESSION_TOKEN) {
  console.error("Error: SESSION_TOKEN environment variable is required");
  process.exit(1);
}

// Initialize API client
const client = new DeployApiClient({
  apiUrl: API_URL,
  sessionToken: SESSION_TOKEN,
});

// Create MCP server with tools capability enabled
const server = new Server({
  name: "deploy",
  version: "0.1.0",
});

// Register tools capability
server.registerCapabilities({
  tools: {},
});

// Helper to format error responses
function formatError(error: unknown): string {
  if (error && typeof error === "object") {
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
  }
  return String(error);
}

// Helper to resolve site name to ID
async function resolveSiteId(siteNameOrId: string): Promise<string> {
  const site = await client.findSiteByName(siteNameOrId);
  if (site) {
    return site.id;
  }

  try {
    await client.getSite(siteNameOrId);
    return siteNameOrId;
  } catch {
    throw new Error(`Site not found: ${siteNameOrId}`);
  }
}

// Define Zod schemas for each tool
const emptySchema = z.object({});
const siteSchema = z.object({ site: z.string() });
const siteWithTypeSchema = z.object({
  site: z.string(),
  type: z.enum(["build", "runtime"]).optional(),
  limit: z.number().optional(),
});
const domainsSchema = z.object({
  site: z.string(),
  domains: z.array(z.string()),
});
const envVarsSchema = z.object({
  site: z.string(),
  action: z.enum(["get", "set"]),
  vars: z.record(z.unknown()).optional(),
});

// The `as any` casts on setRequestHandler's schema argument work around a
// "type instantiation is excessively deep" error from the SDK's zod v3/v4
// compat union types; they don't affect runtime behavior.
// Register tools/list
server.setRequestHandler(
  z.object({ method: z.literal("tools/list") }) as any,
  async () => {
    return {
      tools: [
        {
          name: "list_sites",
          description:
            "List all deployed sites with their current status, visibility, and URLs",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "get_site_status",
          description:
            "Get detailed status and information for a specific site",
          inputSchema: {
            type: "object",
            properties: {
              site: { type: "string", description: "Site name or ID" },
            },
            required: ["site"],
          },
        },
        {
          name: "redeploy_site",
          description: "Trigger a fresh deployment of a site",
          inputSchema: {
            type: "object",
            properties: {
              site: { type: "string", description: "Site name or ID" },
            },
            required: ["site"],
          },
        },
        {
          name: "get_logs",
          description: "Retrieve build or runtime logs for a site",
          inputSchema: {
            type: "object",
            properties: {
              site: { type: "string" },
              type: { type: "string", enum: ["build", "runtime"] },
              limit: { type: "number" },
            },
            required: ["site"],
          },
        },
        {
          name: "set_custom_domains",
          description:
            "Set the full list of custom domains for a site, replacing any existing ones. Pass an empty array to remove all custom domains.",
          inputSchema: {
            type: "object",
            properties: {
              site: { type: "string" },
              domains: { type: "array", items: { type: "string" } },
            },
            required: ["site", "domains"],
          },
        },
        {
          name: "manage_env_vars",
          description:
            "Get or set environment variables for a site. Changes take effect on next build/redeploy.",
          inputSchema: {
            type: "object",
            properties: {
              site: { type: "string" },
              action: { type: "string", enum: ["get", "set"] },
              vars: { type: "object" },
            },
            required: ["site", "action"],
          },
        },
      ],
    };
  }
);

// Register tools/call
server.setRequestHandler(
  z.object({
    method: z.literal("tools/call"),
    params: z.object({
      name: z.string(),
      arguments: z.record(z.unknown()).optional(),
    }),
  }) as any,
  async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments || {};

    try {
      if (toolName === "list_sites") {
        const sites = await client.listSites();
        const formatted = sites.map((site) => {
          const customDomains = parseCustomDomains(site);
          return {
            name: site.name,
            id: site.id,
            status: site.status,
            visibility: site.visibility,
            type: site.type,
            urls: customDomains.length > 0
              ? customDomains.map((d) => `https://${d}`)
              : [`https://${site.name}.keith.is`],
            last_deployed: site.last_deployed_at,
            created: site.created_at,
          };
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(formatted, null, 2),
            } as TextContent,
          ],
        };
      } else if (toolName === "get_site_status") {
        const siteId = await resolveSiteId(args.site as string);
        const siteData = await client.getSite(siteId);
        const customDomains = parseCustomDomains(siteData);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  name: siteData.name,
                  id: siteData.id,
                  status: siteData.status,
                  visibility: siteData.visibility,
                  type: siteData.type,
                  git_url: siteData.git_url,
                  branch: siteData.branch,
                  container_id: siteData.container_id,
                  port: siteData.port,
                  custom_domains: customDomains,
                  urls: customDomains.length > 0
                    ? customDomains.map((d) => `https://${d}`)
                    : [`https://${siteData.name}.keith.is`],
                  created_at: siteData.created_at,
                  last_deployed_at: siteData.last_deployed_at,
                  last_request_at: siteData.last_request_at,
                  sleep_enabled: siteData.sleep_enabled,
                  sleep_after_minutes: siteData.sleep_after_minutes,
                  autodeploy: siteData.autodeploy,
                  persistent_storage: siteData.persistent_storage,
                },
                null,
                2
              ),
            } as TextContent,
          ],
        };
      } else if (toolName === "redeploy_site") {
        const siteId = await resolveSiteId(args.site as string);
        const result = await client.deploySite(siteId);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            } as TextContent,
          ],
        };
      } else if (toolName === "get_logs") {
        const siteId = await resolveSiteId(args.site as string);
        const logs = await client.getSiteLogs(
          siteId,
          (args.type as "build" | "runtime") || undefined,
          (args.limit as number) || 50
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(logs, null, 2),
            } as TextContent,
          ],
        };
      } else if (toolName === "set_custom_domains") {
        const siteId = await resolveSiteId(args.site as string);
        const domains = (args.domains as string[]).map((d) => d.trim()).filter(Boolean);
        const result = await client.setCustomDomains(siteId, domains);
        const customDomains = parseCustomDomains(result);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message: "Custom domains updated",
                  custom_domains: customDomains,
                  urls: customDomains.length > 0
                    ? customDomains.map((d) => `https://${d}`)
                    : [`https://${result.name}.keith.is`],
                },
                null,
                2
              ),
            } as TextContent,
          ],
        };
      } else if (toolName === "manage_env_vars") {
        const siteId = await resolveSiteId(args.site as string);
        const action = args.action as string;

        if (action === "get") {
          const envVars = await client.getEnvVars(siteId);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    user: envVars.user,
                    system: envVars.system,
                    note: "System vars are set automatically. User vars take effect on next build/redeploy.",
                  },
                  null,
                  2
                ),
              } as TextContent,
            ],
          };
        } else if (action === "set") {
          const vars = args.vars as Record<string, unknown>;
          if (!vars || typeof vars !== "object") {
            throw new Error(
              'When action="set", vars must be provided as an object'
            );
          }

          const stringVars = Object.fromEntries(
            Object.entries(vars).map(([k, v]) => [k, String(v)])
          );

          const result = await client.setEnvVars(siteId, stringVars);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    message: result.message,
                    env_vars: result.env_vars,
                    note: "Changes take effect on next build/redeploy",
                  },
                  null,
                  2
                ),
              } as TextContent,
            ],
          };
        } else {
          throw new Error('action must be "get" or "set"');
        }
      } else {
        throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${formatError(error)}`,
          } as TextContent,
        ],
        isError: true,
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "[Deploy MCP] Server started. Connected to API at:",
    API_URL
  );
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
