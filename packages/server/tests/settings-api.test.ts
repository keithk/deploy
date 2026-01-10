// ABOUTME: Tests for the settings REST API endpoint.
// ABOUTME: Validates the domain settings retrieval functionality.

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// Mock session for auth
const mockSession = {
  token: "valid-token-123",
  id: "session-id",
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

let mockSessionFindByToken: ReturnType<typeof mock>;

mock.module("@keithk/deploy-core", () => {
  mockSessionFindByToken = mock((token: string) => {
    if (token === "valid-token-123") return mockSession;
    return null;
  });

  return {
    sessionModel: {
      findByToken: mockSessionFindByToken,
    },
    siteModel: {
      findByName: mock(() => null),
    },
    shareLinkModel: {
      findByToken: mock(() => null),
    },
  };
});

// Import after mocking
const { handleSettingsApi } = await import("../src/api/settings");

function createAuthenticatedRequest(
  url: string,
  options: RequestInit = {}
): Request {
  return new Request(url, {
    ...options,
    headers: {
      ...options.headers,
      cookie: "session=valid-token-123",
    },
  });
}

describe("GET /api/settings", () => {
  const originalEnv = process.env.PROJECT_DOMAIN;

  beforeEach(() => {
    process.env.PROJECT_DOMAIN = "example.com";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PROJECT_DOMAIN = originalEnv;
    } else {
      delete process.env.PROJECT_DOMAIN;
    }
  });

  test("returns domain setting when authenticated", async () => {
    const request = createAuthenticatedRequest("http://localhost/api/settings");
    const response = await handleSettingsApi(request);

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);

    const body = await response!.json();
    expect(body.domain).toBe("example.com");
  });

  test("returns 401 when not authenticated", async () => {
    const request = new Request("http://localhost/api/settings");
    const response = await handleSettingsApi(request);

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });

  test("returns undefined domain when PROJECT_DOMAIN not set", async () => {
    delete process.env.PROJECT_DOMAIN;

    const request = createAuthenticatedRequest("http://localhost/api/settings");
    const response = await handleSettingsApi(request);

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);

    const body = await response!.json();
    expect(body.domain).toBeUndefined();
  });
});

describe("handleSettingsApi routing", () => {
  test("returns null for non-GET methods", async () => {
    const request = createAuthenticatedRequest("http://localhost/api/settings", {
      method: "POST",
    });
    const response = await handleSettingsApi(request);

    expect(response).toBeNull();
  });
});
