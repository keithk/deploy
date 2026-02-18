// ABOUTME: REST API endpoint for server settings.
// ABOUTME: Provides domain configuration, GitHub token, and other server-level settings.

import { settingsModel, updateCaddyConfig } from "@keithk/deploy-core";

/**
 * Handle /api/settings requests
 * Auth is handled centrally in handleApiRequest (handlers.ts).
 * Returns Response if handled, null if not a settings request
 */
export async function handleSettingsApi(
  request: Request
): Promise<Response | null> {
  const method = request.method;

  // GET /api/settings - get all settings
  if (method === "GET") {
    const settings = settingsModel.getAll();
    return Response.json({
      domain: settings.domain || process.env.PROJECT_DOMAIN || "localhost",
      github_configured: !!settings.github_token,
      primary_site: settings.primary_site || null,
      // Build resource settings
      build_nice_level: parseInt(settings.build_nice_level || process.env.BUILD_NICE_LEVEL || "10", 10),
      build_io_class: settings.build_io_class || process.env.BUILD_IO_CLASS || "idle",
      build_max_parallelism: parseInt(settings.build_max_parallelism || process.env.BUILD_MAX_PARALLELISM || "2", 10),
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

      // Handle build resource settings
      if (body.build_nice_level !== undefined) {
        const level = parseInt(body.build_nice_level, 10);
        if (level >= 0 && level <= 19) {
          settingsModel.set("build_nice_level", String(level));
        }
      }

      if (body.build_io_class !== undefined) {
        if (["idle", "best-effort", "realtime"].includes(body.build_io_class)) {
          settingsModel.set("build_io_class", body.build_io_class);
        }
      }

      if (body.build_max_parallelism !== undefined) {
        const parallelism = parseInt(body.build_max_parallelism, 10);
        if (parallelism >= 1 && parallelism <= 16) {
          settingsModel.set("build_max_parallelism", String(parallelism));
        }
      }

      return Response.json({
        success: true,
        domain: settingsModel.get("domain") || process.env.PROJECT_DOMAIN || "localhost",
        github_configured: !!settingsModel.get("github_token"),
        primary_site: settingsModel.get("primary_site") || null,
        build_nice_level: parseInt(settingsModel.get("build_nice_level") || "10", 10),
        build_io_class: settingsModel.get("build_io_class") || "idle",
        build_max_parallelism: parseInt(settingsModel.get("build_max_parallelism") || "2", 10),
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
