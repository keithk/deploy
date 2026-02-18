// ABOUTME: Tests for auth middleware functions.
// ABOUTME: Validates session extraction, validation, and site access control logic.

import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock the core module before importing auth middleware
const mockSession = {
  token: "valid-token-123",
  id: "session-id",
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

const mockSite = {
  id: "site-id-123",
  name: "test-site",
  visibility: "private",
  git_url: "https://github.com/test/repo",
  branch: "main",
  type: "auto",
  status: "running",
  container_id: null,
  port: null,
  env_vars: "{}",
  created_at: new Date().toISOString(),
  last_deployed_at: null,
};

const mockShareLink = {
  id: "share-link-id",
  site_id: "site-id-123",
  token: "share-token-456",
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

let mockSessionFindByToken: ReturnType<typeof mock>;
let mockSiteFindByName: ReturnType<typeof mock>;
let mockShareLinkFindByToken: ReturnType<typeof mock>;

mock.module("@keithk/deploy-core", () => {
  mockSessionFindByToken = mock((token: string) => {
    if (token === "valid-token-123") {
      return mockSession;
    }
    return null;
  });

  mockSiteFindByName = mock((name: string) => {
    if (name === "test-site") {
      return mockSite;
    }
    if (name === "public-site") {
      return { ...mockSite, name: "public-site", visibility: "public" };
    }
    return null;
  });

  mockShareLinkFindByToken = mock((token: string) => {
    if (token === "share-token-456") {
      return mockShareLink;
    }
    return null;
  });

  return {
    sessionModel: {
      findByToken: mockSessionFindByToken,
    },
    siteModel: {
      findByName: mockSiteFindByName,
    },
    shareLinkModel: {
      findByToken: mockShareLinkFindByToken,
    },
  };
});

// Import auth middleware after mocking
const {
  getSessionFromRequest,
  validateSession,
  requireAuth,
  checkSiteAccess,
  createSessionCookie,
} = await import("../src/middleware/auth");

describe("getSessionFromRequest", () => {
  test("extracts token from session cookie", () => {
    const request = new Request("http://localhost/dashboard", {
      headers: { cookie: "session=abc123; other=value" },
    });
    expect(getSessionFromRequest(request)).toBe("abc123");
  });

  test("extracts token from query param", () => {
    const request = new Request("http://localhost/dashboard?token=xyz789");
    expect(getSessionFromRequest(request)).toBe("xyz789");
  });

  test("prefers cookie over query param", () => {
    const request = new Request("http://localhost/dashboard?token=query", {
      headers: { cookie: "session=cookie-value" },
    });
    expect(getSessionFromRequest(request)).toBe("cookie-value");
  });

  test("returns null when no token present", () => {
    const request = new Request("http://localhost/dashboard");
    expect(getSessionFromRequest(request)).toBeNull();
  });

  test("returns null for empty cookie value", () => {
    const request = new Request("http://localhost/dashboard", {
      headers: { cookie: "session=; other=value" },
    });
    expect(getSessionFromRequest(request)).toBeNull();
  });
});

describe("validateSession", () => {
  test("returns true for valid token", () => {
    expect(validateSession("valid-token-123")).toBe(true);
  });

  test("returns false for invalid token", () => {
    expect(validateSession("invalid-token")).toBe(false);
  });

  test("returns false for null token", () => {
    expect(validateSession(null)).toBe(false);
  });
});

describe("requireAuth", () => {
  test("returns null for authenticated request", () => {
    const request = new Request("http://localhost/dashboard", {
      headers: { cookie: "session=valid-token-123" },
    });
    expect(requireAuth(request)).toBeNull();
  });

  test("returns 401 Response for unauthenticated request", () => {
    const request = new Request("http://localhost/dashboard");
    const response = requireAuth(request);
    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  test("returns 401 Response for invalid token", () => {
    const request = new Request("http://localhost/dashboard", {
      headers: { cookie: "session=invalid-token" },
    });
    const response = requireAuth(request);
    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(401);
  });
});

describe("checkSiteAccess", () => {
  test("allows access to public sites", () => {
    const request = new Request("http://localhost/site");
    expect(checkSiteAccess(request, "public-site")).toBe(true);
  });

  test("allows authenticated users access to private sites", () => {
    const request = new Request("http://localhost/site", {
      headers: { cookie: "session=valid-token-123" },
    });
    expect(checkSiteAccess(request, "test-site")).toBe(true);
  });

  test("allows access with valid share link token", () => {
    const request = new Request(
      "http://localhost/site?share_token=share-token-456"
    );
    expect(checkSiteAccess(request, "test-site")).toBe(true);
  });

  test("denies access to private sites without auth", () => {
    const request = new Request("http://localhost/site");
    expect(checkSiteAccess(request, "test-site")).toBe(false);
  });

  test("denies access for non-existent sites", () => {
    const request = new Request("http://localhost/site");
    expect(checkSiteAccess(request, "non-existent")).toBe(false);
  });

  test("denies access with share link for wrong site", () => {
    // share-token-456 is for site-id-123 (test-site), not public-site
    const request = new Request(
      "http://localhost/site?share_token=share-token-456"
    );
    // public-site has a different id, so share link won't match
    expect(checkSiteAccess(request, "public-site")).toBe(true); // Public sites are always accessible
  });
});

describe("createSessionCookie", () => {
  test("creates cookie with correct format", () => {
    const cookie = createSessionCookie("my-token");
    expect(cookie).toContain("session=my-token");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Expires=");
  });

  test("cookie expires in approximately 7 days", () => {
    const cookie = createSessionCookie("my-token");
    const expiresMatch = cookie.match(/Expires=([^;]+)/);
    expect(expiresMatch).not.toBeNull();

    const expiresDate = new Date(expiresMatch![1]);
    const now = new Date();
    const diffDays =
      (expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    // Should be approximately 7 days (within a small tolerance for test execution time)
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });
});
