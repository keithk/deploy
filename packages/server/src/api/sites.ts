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
import { teardownSite, getSiteLogs } from "../services/site-ops";
import { parseComposeFile, ComposeError } from "./compose";

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
 * Parse a multi-line `KEY=VALUE` text blob into a JSON-encoded env-vars string.
 * Skips blank lines and `#` comments; first `=` splits key from value; trims surrounding whitespace.
 * Invalid keys (not matching `[A-Za-z_][A-Za-z0-9_]*`) are silently dropped — they wouldn't be
 * usable env vars anyway.
 */
export function parseEnvText(envText: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!envText) return out;
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip matching surrounding quotes if present (single or double)
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    out[key] = value;
  }
  return out;
}

interface CreateGithubBody {
  source_type?: "github";
  git_url: string;
  name: string;
  sleep_enabled?: boolean;
  sleep_after_minutes?: number | null;
}

interface CreateComposeBody {
  source_type: "compose";
  name: string;
  compose_yaml: string;
  primary_service: string;
  primary_port: number;
  env_text?: string;
  persistent_storage?: boolean;
  git_url?: string | null;
  sleep_enabled?: boolean;
  sleep_after_minutes?: number | null;
}

/**
 * POST /api/sites - Create a new site (github or compose source).
 */
async function handleCreateSite(request: Request): Promise<Response> {
  let body: Partial<CreateGithubBody & CreateComposeBody>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  // Check for duplicate name (applies to both source types)
  const existing = siteModel.findByName(body.name);
  if (existing) {
    return Response.json(
      { error: "Site with this name already exists" },
      { status: 409 }
    );
  }

  if (body.source_type === "compose") {
    return handleCreateComposeSite(body as CreateComposeBody);
  }

  // Default to github source
  if (!body.git_url) {
    return Response.json({ error: "git_url is required" }, { status: 400 });
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

type ValidationResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

/**
 * Validate the inputs for a compose-source create request.
 * Pure function — no DB or filesystem access. Exposed for unit tests.
 */
export function validateCreateComposeBody(body: CreateComposeBody): ValidationResult {
  if (!body.compose_yaml || !body.primary_service || body.primary_port == null) {
    return {
      ok: false,
      error: "compose_yaml, primary_service, and primary_port are all required",
    };
  }
  let parsed: ReturnType<typeof parseComposeFile>;
  try {
    parsed = parseComposeFile(body.compose_yaml);
  } catch (err) {
    if (err instanceof ComposeError) {
      return { ok: false, error: err.message, code: err.code };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid compose file",
    };
  }
  const primary = parsed.services.find((s) => s.name === body.primary_service);
  if (!primary) {
    return {
      ok: false,
      error: `Primary service "${body.primary_service}" is not present in the compose file`,
    };
  }
  if (!primary.ports.includes(body.primary_port)) {
    return {
      ok: false,
      error: `Primary service "${body.primary_service}" does not declare port ${body.primary_port}. Available: ${primary.ports.join(", ") || "none"}`,
    };
  }
  return { ok: true };
}

function handleCreateComposeSite(body: CreateComposeBody): Response {
  const v = validateCreateComposeBody(body);
  if (!v.ok) {
    return Response.json(
      v.code ? { error: v.error, code: v.code } : { error: v.error },
      { status: 400 }
    );
  }

  const envVars = parseEnvText(body.env_text ?? "");

  const site = siteModel.create({
    name: body.name,
    git_url: body.git_url ?? null,
    type: "compose",
    env_vars: JSON.stringify(envVars),
    persistent_storage: body.persistent_storage ?? false,
    sleep_enabled: body.sleep_enabled,
    sleep_after_minutes: body.sleep_after_minutes ?? null,
    compose_yaml: body.compose_yaml,
    primary_service: body.primary_service,
    primary_port: body.primary_port,
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

  // Tear down runtime + on-disk artifacts. teardownSite handles container/compose-project cleanup
  // plus the data directory. We always run it, even if status !== running, so leftover containers
  // from a previously stopped site get cleaned up too.
  try {
    await teardownSite(site);
    info(`Teardown complete for ${site.name}`);
  } catch (err) {
    // Continue with DB deletion even if teardown had partial failures
    info(`Teardown for ${site.name} reported: ${err}`);
  }

  // Delete site from database
  const deleted = siteModel.delete(siteId);
  if (!deleted) {
    return Response.json({ error: "Failed to delete site" }, { status: 500 });
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
      const dockerLogs = await getSiteLogs(site, limit);
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
