// ABOUTME: REST API endpoints for action management.
// ABOUTME: Handles listing, running, and discovering actions from deployed sites.

import { actionModel, siteModel } from "@keithk/deploy-core";
import { requireAuth } from "../middleware/auth";
import { discoverSiteActions } from "../services/actions";
import { getSitePath } from "../services/git";

interface ActionHandlerResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

interface ActionModule {
  default?: {
    handler?: (params: unknown, context: unknown) => Promise<ActionHandlerResult>;
  };
}

/**
 * Handle all /api/actions/* requests
 * Returns Response if handled, null if not an actions path
 */
export async function handleActionsApi(
  request: Request,
  path: string
): Promise<Response | null> {
  if (!path.startsWith("/api/actions")) {
    return null;
  }

  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const method = request.method;
  const pathParts = path.split("/").filter(Boolean);

  // GET /api/actions - List all actions
  if (method === "GET" && pathParts.length === 2) {
    return handleListActions();
  }

  // GET /api/actions/:id - Get single action
  const actionId = pathParts[2];
  if (method === "GET" && pathParts.length === 3 && actionId) {
    return handleGetAction(actionId);
  }

  // POST /api/actions/:id/run - Run an action
  if (method === "POST" && pathParts.length === 4 && pathParts[3] === "run") {
    return handleRunAction(actionId);
  }

  // POST /api/actions/discover/:siteId - Discover actions for a site
  if (method === "POST" && pathParts[2] === "discover" && pathParts[3]) {
    return handleDiscoverActions(pathParts[3]);
  }

  // POST /api/actions/discover-all - Discover actions for all sites
  if (method === "POST" && pathParts[2] === "discover-all") {
    return handleDiscoverAllActions();
  }

  return null;
}

/**
 * GET /api/actions - List all actions
 */
function handleListActions(): Response {
  const actions = actionModel.findAll();
  return Response.json(actions);
}

/**
 * GET /api/actions/:id - Get a single action
 */
function handleGetAction(actionId: string): Response {
  const action = actionModel.findById(actionId);
  if (!action) {
    return Response.json({ error: "Action not found" }, { status: 404 });
  }
  return Response.json(action);
}

/**
 * POST /api/actions/discover/:siteId - Discover actions for a site
 */
async function handleDiscoverActions(siteId: string): Promise<Response> {
  const site = siteModel.findById(siteId);
  if (!site) {
    return Response.json({ error: "Site not found" }, { status: 404 });
  }

  try {
    const sitePath = getSitePath(site.name);
    const actions = await discoverSiteActions(sitePath, siteId);

    // Clear old actions and register new ones
    actionModel.deleteBySiteId(siteId);
    for (const action of actions) {
      actionModel.upsert({
        id: action.id,
        name: action.name || action.id,
        type: action.type,
        site_id: siteId,
        entry_path: action.entryPath,
        enabled: true,
      });
    }

    return Response.json({
      success: true,
      discovered: actions.length,
      actions: actions.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    });
  } catch (error) {
    return Response.json(
      {
        error: "Discovery failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/actions/discover-all - Discover actions for all sites
 */
async function handleDiscoverAllActions(): Promise<Response> {
  const sites = siteModel.findAll();
  const results: { siteId: string; siteName: string; discovered: number }[] =
    [];

  for (const site of sites) {
    try {
      const sitePath = getSitePath(site.name);
      const actions = await discoverSiteActions(sitePath, site.id);

      // Clear old actions and register new ones
      actionModel.deleteBySiteId(site.id);
      for (const action of actions) {
        actionModel.upsert({
          id: action.id,
          name: action.name || action.id,
          type: action.type,
          site_id: site.id,
          entry_path: action.entryPath,
          enabled: true,
        });
      }

      results.push({
        siteId: site.id,
        siteName: site.name,
        discovered: actions.length,
      });
    } catch {
      results.push({ siteId: site.id, siteName: site.name, discovered: 0 });
    }
  }

  const totalDiscovered = results.reduce((sum, r) => sum + r.discovered, 0);
  return Response.json({
    success: true,
    totalDiscovered,
    results,
  });
}

/**
 * POST /api/actions/:id/run - Run an action
 */
async function handleRunAction(actionId: string): Promise<Response> {
  const action = actionModel.findById(actionId);
  if (!action) {
    return Response.json({ error: "Action not found" }, { status: 404 });
  }

  if (!action.entry_path) {
    return Response.json(
      { error: "Action has no entry path" },
      { status: 400 }
    );
  }

  let actionModule: ActionModule;
  try {
    // Import the action module
    actionModule = await import(action.entry_path) as ActionModule;
  } catch (importError) {
    const errorMsg = importError instanceof Error ? importError.message : String(importError);
    actionModel.updateLastRun(actionId, "error", `Import failed: ${errorMsg}`);
    return Response.json(
      { error: "Failed to import action module", details: errorMsg },
      { status: 500 }
    );
  }

  if (!actionModule.default || typeof actionModule.default.handler !== "function") {
    actionModel.updateLastRun(actionId, "error", "Action has no handler function");
    return Response.json(
      { error: "Action has no handler function" },
      { status: 400 }
    );
  }

  try {
    // Build context for the action
    const sites = siteModel.findAll();
    const site = action.site_id ? siteModel.findById(action.site_id) : null;
    const sitePath = site ? getSitePath(site.name) : null;

    // Load site-specific environment variables
    let siteEnv: Record<string, string> = {};
    if (sitePath) {
      const { loadEnvFile } = await import("../utils");
      const envPath = `${sitePath}/.env`;
      siteEnv = await loadEnvFile(envPath);
    }

    const context = {
      rootDir: process.env.ROOT_DIR || process.cwd(),
      mode: "serve" as const,
      sites: sites.map((s) => ({
        ...s,
        path: getSitePath(s.name),
        subdomain: s.name,
      })),
      site: site
        ? { ...site, path: sitePath!, subdomain: site.name }
        : undefined,
      env: siteEnv,
    };

    // Execute the handler
    console.log(`Executing action handler: ${actionId}`);
    const result = await actionModule.default!.handler!({}, context);
    console.log(`Action handler completed: ${actionId}, success=${result?.success}`);

    // Validate result
    if (!result || typeof result !== "object") {
      const errorMsg = "Action handler returned invalid result";
      actionModel.updateLastRun(actionId, "error", errorMsg);
      return Response.json({ error: errorMsg }, { status: 500 });
    }

    actionModel.updateLastRun(
      actionId,
      result.success ? "success" : "error",
      result.message || (result.success ? "Completed" : "Failed")
    );

    console.log(`Sending response for action: ${actionId}`);
    return Response.json({
      success: result.success,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Action execution error for ${actionId}:`, errorMsg);
    actionModel.updateLastRun(actionId, "error", errorMsg);
    return Response.json(
      {
        error: "Action execution failed",
        details: errorMsg,
      },
      { status: 500 }
    );
  }
}
