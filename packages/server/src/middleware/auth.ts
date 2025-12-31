// ABOUTME: Authentication middleware for dashboard requests.
// ABOUTME: Handles session validation, site access control, and cookie management.

import { sessionModel, siteModel, shareLinkModel } from "@keithk/deploy-core";

/**
 * Extract session token from cookie or query parameter.
 * Prefers cookie over query param.
 */
export function getSessionFromRequest(request: Request): string | null {
  // Check cookie header first
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      const [name, value] = cookie.split("=");
      if (name === "session" && value) {
        return value;
      }
    }
  }

  // Fall back to query parameter
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  return token || null;
}

/**
 * Validate a session token.
 * Returns true if the token is valid and not expired.
 */
export function validateSession(token: string | null): boolean {
  if (!token) {
    return false;
  }
  const session = sessionModel.findByToken(token);
  return session !== null;
}

/**
 * Middleware to require authentication.
 * Returns a 401 Response if not authenticated, null if OK to proceed.
 */
export function requireAuth(request: Request): Response | null {
  const token = getSessionFromRequest(request);
  if (!validateSession(token)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": "Bearer",
        "Content-Type": "text/plain",
      },
    });
  }
  return null;
}

/**
 * Check if a request has access to a site.
 * Access is granted if:
 * 1. The site is public
 * 2. The request has a valid session
 * 3. The request has a valid share link token for this site
 */
export function checkSiteAccess(request: Request, siteName: string): boolean {
  const site = siteModel.findByName(siteName);
  if (!site) {
    return false;
  }

  // Public sites are always accessible
  if (site.visibility === "public") {
    return true;
  }

  // Check for authenticated session
  const sessionToken = getSessionFromRequest(request);
  if (validateSession(sessionToken)) {
    return true;
  }

  // Check for valid share link
  const url = new URL(request.url);
  const shareToken = url.searchParams.get("share_token");
  if (shareToken) {
    const shareLink = shareLinkModel.findByToken(shareToken);
    if (shareLink && shareLink.site_id === site.id) {
      return true;
    }
  }

  return false;
}

/**
 * Create a session cookie string with HttpOnly, Secure, and SameSite flags.
 * Cookie expires in 7 days.
 */
export function createSessionCookie(token: string): string {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return `session=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${expiresAt.toUTCString()}`;
}
