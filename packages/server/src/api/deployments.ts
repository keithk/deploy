// ABOUTME: REST API endpoint for deployment tracking.
// ABOUTME: Provides access to in-progress and historical deployments.

import { deploymentModel, siteModel } from "@keithk/deploy-core";
import { requireAuth } from "../middleware/auth";

/**
 * Handle /api/deployments requests
 * Returns Response if handled, null if not a deployments request
 */
export async function handleDeploymentsApi(
  request: Request,
  path: string
): Promise<Response | null> {
  const method = request.method;
  const pathParts = path.split("/").filter(Boolean);

  // /api/deployments
  if (pathParts.length === 2 && pathParts[1] === "deployments") {
    if (method === "GET") {
      return handleGetDeployments(request);
    }
  }

  // /api/deployments/active
  if (pathParts.length === 3 && pathParts[1] === "deployments" && pathParts[2] === "active") {
    if (method === "GET") {
      return handleGetActiveDeployments(request);
    }
  }

  // /api/deployments/:id
  if (pathParts.length === 3 && pathParts[1] === "deployments") {
    const deploymentId = pathParts[2];
    if (method === "GET") {
      return handleGetDeployment(request, deploymentId);
    }
  }

  // /api/sites/:id/deployments
  if (pathParts.length === 4 && pathParts[1] === "sites" && pathParts[3] === "deployments") {
    const siteId = pathParts[2];
    if (method === "GET") {
      return handleGetSiteDeployments(request, siteId);
    }
  }

  return null;
}

/**
 * GET /api/deployments - Get all recent deployments
 */
async function handleGetDeployments(request: Request): Promise<Response> {
  // Require authentication
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    const deployments = deploymentModel.findAll(limit);

    // Enrich with site names
    const enrichedDeployments = deployments.map((d) => {
      const site = siteModel.findById(d.site_id);
      return {
        ...d,
        site_name: site?.name || "Unknown",
      };
    });

    return Response.json(enrichedDeployments);
  } catch (error) {
    console.error("Error getting deployments:", error);
    return Response.json({ error: "Failed to get deployments" }, { status: 500 });
  }
}

/**
 * GET /api/deployments/active - Get all in-progress deployments
 */
async function handleGetActiveDeployments(request: Request): Promise<Response> {
  // Require authentication
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  try {
    const deployments = deploymentModel.findActive();

    // Enrich with site names
    const enrichedDeployments = deployments.map((d) => {
      const site = siteModel.findById(d.site_id);
      return {
        ...d,
        site_name: site?.name || "Unknown",
      };
    });

    return Response.json(enrichedDeployments);
  } catch (error) {
    console.error("Error getting active deployments:", error);
    return Response.json({ error: "Failed to get active deployments" }, { status: 500 });
  }
}

/**
 * GET /api/deployments/:id - Get a specific deployment
 */
async function handleGetDeployment(
  request: Request,
  deploymentId: string
): Promise<Response> {
  // Require authentication
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  try {
    const deployment = deploymentModel.findById(deploymentId);

    if (!deployment) {
      return Response.json({ error: "Deployment not found" }, { status: 404 });
    }

    const site = siteModel.findById(deployment.site_id);

    return Response.json({
      ...deployment,
      site_name: site?.name || "Unknown",
    });
  } catch (error) {
    console.error("Error getting deployment:", error);
    return Response.json({ error: "Failed to get deployment" }, { status: 500 });
  }
}

/**
 * GET /api/sites/:id/deployments - Get deployments for a specific site
 */
async function handleGetSiteDeployments(
  request: Request,
  siteId: string
): Promise<Response> {
  // Require authentication
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);

    const site = siteModel.findById(siteId);
    if (!site) {
      return Response.json({ error: "Site not found" }, { status: 404 });
    }

    const deployments = deploymentModel.findBySiteId(siteId, limit);

    return Response.json(
      deployments.map((d) => ({
        ...d,
        site_name: site.name,
      }))
    );
  } catch (error) {
    console.error("Error getting site deployments:", error);
    return Response.json({ error: "Failed to get site deployments" }, { status: 500 });
  }
}
