import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  actionRegistry,
  loadRootConfig,
  discoverActions,
  initializeGitHubAction,
  executeCommand as serverExecuteCommand,
  buildSite as serverBuildSite
} from "../../server";
import {
  setServerExecuteCommand,
  setServerBuildSite
} from "../../actions";
import { getSites } from "./site-manager";

// Default root directory for sites
const DEFAULT_ROOT_DIR = process.env.ROOT_DIR || join(process.cwd(), "sites");

/**
 * Initialize the action registry with all available actions
 */
export async function initializeActionRegistry(
  rootDir = DEFAULT_ROOT_DIR
): Promise<void> {
  // Initialize the actions package with server functions
  setServerExecuteCommand(serverExecuteCommand);
  setServerBuildSite(serverBuildSite);

  // Load root config
  const rootConfig = await loadRootConfig();

  // Initialize GitHub webhook action if configured
  initializeGitHubAction(rootConfig);

  // Discover sites
  const sites = await getSites(rootDir);

  // Discover and register site-specific actions
  const actions = await discoverActions(rootDir, sites);
  actions.forEach((action) => actionRegistry.register(action));
}

/**
 * List all registered actions
 */
export function listActions(): string {
  const allActions = actionRegistry.getAll();

  if (allActions.length === 0) {
    return "No actions found.";
  }

  // Group actions by site
  const rootActions = allActions.filter((a) => !a.siteId);
  const siteActions = allActions.filter((a) => a.siteId);

  let output = "";

  if (rootActions.length > 0) {
    output += "\nRoot Actions:";
    rootActions.forEach((action) => {
      output += `\n  - ${action.id} (${action.type})`;
    });
  }

  if (siteActions.length > 0) {
    output += "\n\nSite Actions:";

    // Group by site ID
    const siteGroups: Record<string, typeof siteActions> = {};

    for (const action of siteActions) {
      if (!action.siteId) continue;

      if (!siteGroups[action.siteId]) {
        siteGroups[action.siteId] = [];
      }

      siteGroups[action.siteId].push(action);
    }

    // Display grouped actions
    for (const [siteId, actions] of Object.entries(siteGroups)) {
      output += `\n  ${siteId}:`;
      actions.forEach((action) => {
        output += `\n    - ${action.id} (${action.type})`;
      });
    }
  }

  return output;
}

/**
 * Run an action by ID
 */
export async function runAction(
  actionId: string,
  payload: Record<string, any> = {}
): Promise<{
  success: boolean;
  message: string;
  data?: any;
}> {
  try {
    // Execute the action
    const result = await actionRegistry.execute(actionId, payload, {
      rootDir: DEFAULT_ROOT_DIR,
      mode: "serve",
      sites: await getSites(DEFAULT_ROOT_DIR)
    });

    return {
      success: result.success,
      message: result.message,
      data: result.data
    };
  } catch (error) {
    return {
      success: false,
      message: `Error running action: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
}

/**
 * Create a site-specific action as a TypeScript file
 */
export async function createSiteAction(
  siteName: string,
  actionType: string,
  options: Record<string, any> = {}
): Promise<{
  success: boolean;
  message: string;
}> {
  const sites = await getSites();
  const site = sites.find((s) => s.path.endsWith(`/${siteName}`));

  if (!site) {
    return {
      success: false,
      message: `Site "${siteName}" not found.`
    };
  }

  // Create .dialup/actions directory if it doesn't exist
  const actionsDir = join(site.path, ".dialup", "actions");
  if (!existsSync(actionsDir)) {
    try {
      mkdirSync(actionsDir, { recursive: true });
    } catch (error) {
      return {
        success: false,
        message: `Failed to create .dialup/actions directory: ${
          error instanceof Error ? error.message : String(error)
        }`
      };
    }
  }

  // Generate action ID if not provided
  const actionId = options.id || `${actionType}-action`;

  // Create the TypeScript file path
  const actionFilePath = join(actionsDir, `${actionId}.ts`);

  // Check if file already exists
  const fileExists = existsSync(actionFilePath);

  // Generate TypeScript content based on action type
  let actionContent = "";

  if (actionType === "scheduled") {
    const schedule = options.schedule || "0 * * * *"; // Default: every hour
    const command = options.command || "echo 'No command specified'";
    const triggerBuild =
      options.triggerBuild !== undefined ? options.triggerBuild : true;

    actionContent = `import { defineScheduledAction, executeCommand, buildSite } from "../../actions";

export default defineScheduledAction({
  id: "${actionId}",
  schedule: "${schedule}",
  async handler(payload, context) {
    // Execute the command
    const result = await executeCommand("${command}", {
      cwd: context.site?.path || ""
    });

    ${
      triggerBuild
        ? `
    // Trigger build if specified
    if (result.success) {
      const buildResult = await buildSite(context.site!, context);
      
      return {
        success: buildResult.success && result.success,
        message: \`Command: \${result.message}, Build: \${buildResult.message}\`,
        data: result.data
      };
    }`
        : ""
    }

    return {
      success: result.success,
      message: result.message,
      data: result.data
    };
  }
});
`;
  } else if (actionType === "webhook") {
    const path = options.path || "/webhook";
    const secret = options.secret ? `\n  // Secret: ${options.secret}` : "";

    actionContent = `import { defineWebhookAction } from "../../actions";

export default defineWebhookAction({
  id: "${actionId}",
  path: "${path}",${secret}
  async handler(payload, context) {
    // Process the webhook payload
    console.log("Received webhook:", payload);
    
    // Add your webhook handling logic here
    
    return {
      success: true,
      message: "Webhook processed successfully",
      data: payload
    };
  }
});
`;
  } else if (actionType === "route") {
    const path = options.path || "/api/example";

    actionContent = `import { defineRouteAction } from "../../actions";

export default defineRouteAction({
  id: "${actionId}",
  routes: [
    {
      path: "${path}",
      method: "GET",
      handler: async (request, context) => {
        return new Response(JSON.stringify({
          message: "Hello from ${actionId}!",
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  ],
  async handler(payload, context) {
    return {
      success: true,
      message: "Route action executed directly",
      data: { payload }
    };
  }
});
`;
  } else if (actionType === "hook") {
    const hook = options.hook || "server:after-start";

    actionContent = `import { defineHookAction } from "../../actions";

export default defineHookAction({
  id: "${actionId}",
  hooks: ["${hook}"],
  async handler(payload, context) {
    console.log(\`Hook triggered: ${hook}\`);
    
    // Add your hook handling logic here
    
    return {
      success: true,
      message: "Hook executed successfully",
      data: {
        timestamp: new Date().toISOString()
      }
    };
  }
});
`;
  } else {
    return {
      success: false,
      message: `Unsupported action type: ${actionType}. Supported types are: scheduled, webhook, route, hook`
    };
  }

  // Write the TypeScript file
  try {
    writeFileSync(actionFilePath, actionContent, "utf-8");
    return {
      success: true,
      message: `Action "${actionId}" ${
        fileExists ? "updated" : "created"
      } successfully.`
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to write action file: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
}
