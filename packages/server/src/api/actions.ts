// ABOUTME: REST API endpoints for action management.
// ABOUTME: Handles listing and running actions discovered from deployed sites.

import { actionModel } from "@keithk/deploy-core";
import { requireAuth } from "../middleware/auth";

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

  try {
    // Import and execute the action
    const module = await import(action.entry_path);
    if (module.default && typeof module.default.execute === "function") {
      await module.default.execute();
      actionModel.updateLastRun(actionId, "success");
      return Response.json({ success: true, message: "Action executed" });
    } else {
      return Response.json(
        { error: "Action has no execute function" },
        { status: 400 }
      );
    }
  } catch (error) {
    actionModel.updateLastRun(actionId, "error");
    return Response.json(
      {
        error: "Action execution failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
