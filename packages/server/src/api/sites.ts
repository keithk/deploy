// ABOUTME: REST API endpoints for site management.
// ABOUTME: Handles CRUD operations, deployments, share links, and environment variables.

import {
  siteModel,
  shareLinkModel,
  logModel,
  error,
  info,
} from "@keithk/deploy-core";
import { requireAuth } from "../middleware/auth";
import { deploySite } from "../services/deploy";
import {
  stopContainer,
  removeSiteDataDirectory,
  getContainerLogs,
} from "../services/container";

/**
 * Handle all /api/sites/* requests
 * Returns Response if handled, null if not a sites path
 */
export async function handleSitesApi(
  request: Request,
  path: string
): Promise<Response | null> {
  // Only handle /api/sites paths
  if (!path.startsWith("/api/sites")) {
    return null;
  }

  // All sites endpoints require authentication
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const method = request.method;
  const pathParts = path.split("/").filter(Boolean); // ['api', 'sites', ...]

  // GET /api/sites - List all sites
  if (method === "GET" && pathParts.length === 2) {
    return handleListSites();
  }

  // POST /api/sites - Create new site
  if (method === "POST" && pathParts.length === 2) {
    return handleCreateSite(request);
  }

  // Extract site ID for single-site operations
  const siteId = pathParts[2];
  if (!siteId) {
    return null;
  }

  // GET /api/sites/:id - Get single site
  if (method === "GET" && pathParts.length === 3) {
    return handleGetSite(siteId);
  }

  // PATCH /api/sites/:id - Update site
  if (method === "PATCH" && pathParts.length === 3) {
    return handleUpdateSite(siteId, request);
  }

  // DELETE /api/sites/:id - Delete site
  if (method === "DELETE" && pathParts.length === 3) {
    return handleDeleteSite(siteId);
  }

  // Check for sub-resource operations
  const subResource = pathParts[3];

  // POST /api/sites/:id/deploy - Trigger deployment
  if (method === "POST" && subResource === "deploy") {
    return handleDeploySite(siteId);
  }

  // GET /api/sites/:id/logs - Get site logs
  if (method === "GET" && subResource === "logs") {
    return handleGetLogs(siteId, request);
  }

  // POST /api/sites/:id/share - Create share link
  if (method === "POST" && subResource === "share") {
    return handleCreateShareLink(siteId, request);
  }

  // GET /api/sites/:id/env - Get environment variables
  if (method === "GET" && subResource === "env") {
    return handleGetEnvVars(siteId);
  }

  // PATCH /api/sites/:id/env - Update environment variables
  if (method === "PATCH" && subResource === "env") {
    return handleUpdateEnvVars(siteId, request);
  }

  return null;
}

/**
 * GET /api/sites - List all sites
 */
function handleListSites(): Response {
  const sites = siteModel.findAll();
  return Response.json(sites);
}

/**
 * POST /api/sites - Create a new site
 */
async function handleCreateSite(request: Request): Promise<Response> {
  let body: {
    git_url?: string;
    name?: string;
    sleep_enabled?: boolean;
    sleep_after_minutes?: number;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.git_url) {
    return Response.json({ error: "git_url is required" }, { status: 400 });
  }

  if (!body.name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  // Check for duplicate name
  const existing = siteModel.findByName(body.name);
  if (existing) {
    return Response.json(
      { error: "Site with this name already exists" },
      { status: 409 }
    );
  }

  const site = siteModel.create({
    name: body.name,
    git_url: body.git_url,
    type: "auto",
    sleep_enabled: body.sleep_enabled,
    sleep_after_minutes: body.sleep_after_minutes ?? null,
  });

  return Response.json(site, { status: 201 });
}

/**
 * GET /api/sites/:id - Get a single site
 */
function handleGetSite(siteId: string): Response {
  const site = siteModel.findById(siteId);
  if (!site) {
    return Response.json({ error: "Site not found" }, { status: 404 });
  }
  return Response.json(site);
}

/**
 * PATCH /api/sites/:id - Update a site
 */
async function handleUpdateSite(
  siteId: string,
  request: Request
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const site = siteModel.update(siteId, body);
  if (!site) {
    return Response.json({ error: "Site not found" }, { status: 404 });
  }

  return Response.json(site);
}

/**
 * DELETE /api/sites/:id - Delete a site
 */
async function handleDeleteSite(siteId: string): Promise<Response> {
  const site = siteModel.findById(siteId);
  if (!site) {
    return Response.json({ error: "Site not found" }, { status: 404 });
  }

  // Stop container if running
  if (site.status === "running") {
    try {
      await stopContainer(site.name);
      info(`Stopped container for ${site.name}`);
    } catch (err) {
      // Container might not exist, continue with deletion
    }
  }

  // Delete site from database
  const deleted = siteModel.delete(siteId);
  if (!deleted) {
    return Response.json({ error: "Failed to delete site" }, { status: 500 });
  }

  // Remove persistent data directory if it existed
  if (site.persistent_storage) {
    removeSiteDataDirectory(site.name);
  }

  return new Response(null, { status: 204 });
}

/**
 * GET /api/sites/:id/logs - Get logs for a site
 */
async function handleGetLogs(
  siteId: string,
  request: Request
): Promise<Response> {
  const site = siteModel.findById(siteId);
  if (!site) {
    return Response.json({ error: "Site not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") as "build" | "runtime" | null;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  // For runtime logs, fetch directly from Docker container
  if (type === "runtime") {
    if (site.status !== "running") {
      return Response.json([]);
    }
    try {
      const dockerLogs = await getContainerLogs(site.name, limit);
      // Format as log entries for consistent frontend handling
      const lines = dockerLogs.split("\n").filter((line) => line.trim());
      const logs = lines.map((line, i) => ({
        id: `runtime-${i}`,
        content: line,
        timestamp: new Date().toISOString(),
        type: "runtime",
      }));
      return Response.json(logs);
    } catch (err) {
      return Response.json([
        {
          id: "error",
          content: `Failed to fetch container logs: ${err}`,
          timestamp: new Date().toISOString(),
          type: "runtime",
        },
      ]);
    }
  }

  // For build logs, use database
  const logs = type
    ? logModel.findBySiteIdAndType(siteId, type, limit)
    : logModel.findBySiteId(siteId, limit);

  return Response.json(logs);
}

/**
 * POST /api/sites/:id/deploy - Trigger a deployment
 */
function handleDeploySite(siteId: string): Response {
  const site = siteModel.findById(siteId);
  if (!site) {
    return Response.json({ error: "Site not found" }, { status: 404 });
  }

  // Trigger deployment in background
  deploySite(siteId)
    .then((result) => {
      if (!result.success) {
        error(`Deployment failed for ${site.name}: ${result.error}`);
      }
    })
    .catch((err) => {
      error(`Deployment error for ${site.name}: ${err}`);
    });

  return Response.json({ message: "Deployment triggered", site_id: siteId });
}

/**
 * POST /api/sites/:id/share - Create a share link
 */
async function handleCreateShareLink(
  siteId: string,
  request: Request
): Promise<Response> {
  const site = siteModel.findById(siteId);
  if (!site) {
    return Response.json({ error: "Site not found" }, { status: 404 });
  }

  let hours = 24;
  try {
    const body = await request.json();
    if (body.hours && typeof body.hours === "number") {
      hours = body.hours;
    }
  } catch {
    // Empty body is fine, use default hours
  }

  const shareLink = shareLinkModel.create(siteId, hours);

  return Response.json(
    { token: shareLink.token, expires_at: shareLink.expires_at },
    { status: 201 }
  );
}

/**
 * GET /api/sites/:id/env - Get environment variables
 */
function handleGetEnvVars(siteId: string): Response {
  const site = siteModel.findById(siteId);
  if (!site) {
    return Response.json({ error: "Site not found" }, { status: 404 });
  }

  // Parse user-defined env vars
  let userEnvVars: Record<string, string> = {};
  if (site.env_vars) {
    try {
      userEnvVars = JSON.parse(site.env_vars);
    } catch {
      userEnvVars = {};
    }
  }

  // Build system env vars (these are injected at runtime)
  const systemEnvVars: Record<string, string> = {};
  if (site.port) {
    systemEnvVars.PORT = String(site.port);
  }
  if (site.persistent_storage) {
    systemEnvVars.DATA_DIR = "/data";
  }

  return Response.json({
    user: userEnvVars,
    system: systemEnvVars,
  });
}

/**
 * PATCH /api/sites/:id/env - Update environment variables
 */
async function handleUpdateEnvVars(
  siteId: string,
  request: Request
): Promise<Response> {
  const site = siteModel.findById(siteId);
  if (!site) {
    return Response.json({ error: "Site not found" }, { status: 404 });
  }

  let envVars: Record<string, string>;
  try {
    envVars = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Merge with existing env vars
  let existingEnv: Record<string, string> = {};
  try {
    existingEnv = JSON.parse(site.env_vars);
  } catch {
    existingEnv = {};
  }

  const mergedEnv = { ...existingEnv, ...envVars };
  const updatedSite = siteModel.update(siteId, {
    env_vars: JSON.stringify(mergedEnv),
  });

  return Response.json({
    message: "Environment variables updated",
    env_vars: mergedEnv,
  });
}
