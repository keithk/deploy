// ABOUTME: REST API endpoint for server settings.
// ABOUTME: Provides domain configuration, GitHub token, and other server-level settings.

import { settingsModel } from "@keithk/deploy-core";
import { requireAuth } from "../middleware/auth";

/**
 * Handle /api/settings requests
 * Returns Response if handled, null if not a settings request
 */
export async function handleSettingsApi(
  request: Request
): Promise<Response | null> {
  const method = request.method;

  // Require authentication for all settings operations
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  // GET /api/settings - get all settings
  if (method === "GET") {
    const settings = settingsModel.getAll();
    return Response.json({
      domain: process.env.PROJECT_DOMAIN,
      github_configured: !!settings.github_token,
      // Don't expose the actual token
    });
  }

  // PUT /api/settings - update settings
  if (method === "PUT" || method === "PATCH") {
    try {
      const body = await request.json();

      // Handle github_token
      if (body.github_token !== undefined) {
        if (body.github_token) {
          settingsModel.set("github_token", body.github_token);
        } else {
          settingsModel.delete("github_token");
        }
      }

      return Response.json({
        success: true,
        github_configured: !!settingsModel.get("github_token"),
      });
    } catch (error) {
      return Response.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }
  }

  return null;
}
