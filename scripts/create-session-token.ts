#!/usr/bin/env bun
/**
 * Create a long-lived session token for MCP server authentication.
 * Usage: bun scripts/create-session-token.ts
 */

import { sessionModel } from "@keithk/deploy-core";

console.log("Creating a new session token for MCP server...\n");

try {
  const session = sessionModel.create();

  console.log("Session token created successfully!\n");
  console.log("Token:", session.token);
  console.log("\nCreated at:", session.created_at);
  console.log("Expires at:", session.expires_at);
  console.log("\nStore this token in your environment variable: SESSION_TOKEN");
  console.log("Add it to claude_desktop_config.json:");
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          deploy: {
            command: "bun",
            args: ["/path/to/deploy/packages/mcp/dist/index.js"],
            env: {
              API_URL: "https://admin.keith.is",
              SESSION_TOKEN: session.token,
            },
          },
        },
      },
      null,
      2
    )
  );
} catch (error) {
  console.error("Error creating session token:", error);
  process.exit(1);
}
