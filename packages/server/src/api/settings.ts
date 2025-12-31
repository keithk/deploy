// ABOUTME: REST API endpoint for server settings.
// ABOUTME: Provides domain configuration and other server-level settings.

import { requireAuth } from "../middleware/auth";

/**
 * Handle GET /api/settings request
 * Returns Response if handled, null if not a settings request
 */
export async function handleSettingsApi(
  request: Request
): Promise<Response | null> {
  // Only handle GET requests
  if (request.method !== "GET") {
    return null;
  }

  // Require authentication
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  return Response.json({
    domain: process.env.PROJECT_DOMAIN,
  });
}
