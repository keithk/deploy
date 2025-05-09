
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  actionRegistry,
  loadRootConfig,
  discoverActions,
  initializeGitHubAction
} from "@dialup-deploy/server";
import { getSites } from "./site-manager";

// Default root directory for sites
const DEFAULT_ROOT_DIR = process.env.ROOT_DIR || join(process.cwd(), "sites");

/**
 * Initialize the action registry with all available actions
 */
export async function initializeActionRegistry(
  rootDir = DEFAULT_ROOT_DIR
): Promise<void> {
  // Load root config
  const rootConfig = await loadRootConfig();

  // Initialize GitHub webhook action if configured
  initializeGitHubAction(rootConfig, actionRegistry);

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
 * Create a site-specific action configuration
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

  // Create .flexi directory if it doesn't exist
  const flexiDir = join(site.path, ".flexi");
  if (!existsSync(flexiDir)) {
    try {
      mkdirSync(flexiDir, { recursive: true });
    } catch (error) {
      return {
        success: false,
        message: `Failed to create .flexi directory: ${
          error instanceof Error ? error.message : String(error)
        }`
      };
    }
  }

  // Load existing actions.json if it exists
  const actionsPath = join(flexiDir, "actions.json");
  let actionsConfig: { actions: any[] } = { actions: [] };

  if (existsSync(actionsPath)) {
    try {
      const content = readFileSync(actionsPath, "utf-8");
      actionsConfig = JSON.parse(content);
    } catch (error) {
      console.warn(
        `Failed to read existing actions.json: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Continue with empty actions array
    }
  }

  // Create action config based on type
  let actionConfig: any = {
    id: options.id || `${actionType}-action`,
    type: actionType
  };

  if (actionType === "scheduled") {
    actionConfig.schedule = options.schedule || "0 * * * *"; // Default: every hour
    actionConfig.command = options.command || "";
    actionConfig.triggerBuild =
      options.triggerBuild !== undefined ? options.triggerBuild : true;
  } else if (actionType === "webhook") {
    actionConfig.path = options.path || "/webhook";
    if (options.secret) {
      actionConfig.secret = options.secret;
    }
  } else {
    return {
      success: false,
      message: `Unsupported action type: ${actionType}`
    };
  }

  // Add or update the action
  const existingIndex = actionsConfig.actions.findIndex(
    (a) => a.id === actionConfig.id
  );

  if (existingIndex >= 0) {
    actionsConfig.actions[existingIndex] = actionConfig;
  } else {
    actionsConfig.actions.push(actionConfig);
  }

  // Write the updated config
  try {
    writeFileSync(actionsPath, JSON.stringify(actionsConfig, null, 2), "utf-8");
    return {
      success: true,
      message: `Action "${actionConfig.id}" ${
        existingIndex >= 0 ? "updated" : "created"
      } successfully.`
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to write actions.json: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
}
