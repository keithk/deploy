// ABOUTME: REST API endpoint for server settings.
// ABOUTME: Provides domain configuration, GitHub token, and other server-level settings.

import { settingsModel, updateCaddyConfig } from "@keithk/deploy-core";
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
      domain: settings.domain || process.env.PROJECT_DOMAIN || "localhost",
      github_configured: !!settings.github_token,
      primary_site: settings.primary_site || null,
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

      // Handle primary_site
      if (body.primary_site !== undefined) {
        if (body.primary_site) {
          settingsModel.set("primary_site", body.primary_site);
        } else {
          settingsModel.delete("primary_site");
        }
      }

      // Handle domain
      let caddyMessage: string | undefined;
      if (body.domain !== undefined) {
        if (body.domain) {
          settingsModel.set("domain", body.domain);

          // Regenerate Caddyfile with new domain
          const caddyResult = await updateCaddyConfig({
            domain: body.domain,
            sitesDir: process.env.ROOT_DIR || "./sites",
            port: parseInt(process.env.PORT || "3000", 10),
          });

          caddyMessage = caddyResult.message;
        } else {
          settingsModel.delete("domain");
        }
      }

      return Response.json({
        success: true,
        domain: settingsModel.get("domain") || process.env.PROJECT_DOMAIN || "localhost",
        github_configured: !!settingsModel.get("github_token"),
        primary_site: settingsModel.get("primary_site") || null,
        caddy_updated: caddyMessage,
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
