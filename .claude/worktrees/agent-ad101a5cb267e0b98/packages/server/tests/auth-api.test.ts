// ABOUTME: Tests for the auth API endpoints.
// ABOUTME: Validates login, logout, setup, and check flows with password auth.

import { describe, test, expect, beforeEach, mock } from "bun:test";

const mockSession = {
  token: "new-session-token",
  id: "session-id",
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

let storedPasswordHash: string | null = null;
let storedSessions: Map<string, typeof mockSession> = new Map();

mock.module("@keithk/deploy-core", () => {
  return {
    sessionModel: {
      create: mock(() => {
        storedSessions.set(mockSession.token, mockSession);
        return mockSession;
      }),
      findByToken: mock((token: string) => {
        return storedSessions.get(token) || null;
      }),
      delete: mock((token: string) => {
        return storedSessions.delete(token);
      }),
    },
    settingsModel: {
      get: mock((key: string) => {
        if (key === "password_hash") return storedPasswordHash;
        return null;
      }),
      set: mock((key: string, value: string) => {
        if (key === "password_hash") storedPasswordHash = value;
      }),
    },
    // Stubs required by middleware/auth.ts imports
    siteModel: { findByName: mock(() => null) },
    shareLinkModel: { findByToken: mock(() => null) },
  };
});

const { handleAuthApi } = await import("../src/api/auth");

beforeEach(() => {
  storedPasswordHash = null;
  storedSessions = new Map();
});

describe("POST /api/auth/setup", () => {
  test("sets password when none exists", async () => {
    const request = new Request("http://localhost/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "mysecurepassword" }),
    });

    const response = await handleAuthApi(request, "/api/auth/setup");
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);

    const data = await response!.json();
    expect(data.success).toBe(true);

    // Should set a cookie
    expect(response!.headers.get("Set-Cookie")).toContain("session=");

    // Password hash should be stored
    expect(storedPasswordHash).not.toBeNull();
  });

  test("rejects setup when password already exists", async () => {
    storedPasswordHash = "existing-hash";

    const request = new Request("http://localhost/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "newpassword123" }),
    });

    const response = await handleAuthApi(request, "/api/auth/setup");
    expect(response!.status).toBe(403);
  });

  test("rejects short passwords", async () => {
    const request = new Request("http://localhost/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "short" }),
    });

    const response = await handleAuthApi(request, "/api/auth/setup");
    expect(response!.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  test("logs in with correct password", async () => {
    // Set up a password first
    storedPasswordHash = await Bun.password.hash("testpassword123", {
      algorithm: "argon2id",
    });

    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "testpassword123" }),
    });

    const response = await handleAuthApi(request, "/api/auth/login");
    expect(response!.status).toBe(200);

    const data = await response!.json();
    expect(data.success).toBe(true);
    expect(response!.headers.get("Set-Cookie")).toContain("session=");
  });

  test("rejects wrong password", async () => {
    storedPasswordHash = await Bun.password.hash("testpassword123", {
      algorithm: "argon2id",
    });

    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrongpassword" }),
    });

    const response = await handleAuthApi(request, "/api/auth/login");
    expect(response!.status).toBe(401);
  });

  test("rejects login when no password is set", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "anything" }),
    });

    const response = await handleAuthApi(request, "/api/auth/login");
    expect(response!.status).toBe(400);
  });

  test("rejects empty password", async () => {
    storedPasswordHash = await Bun.password.hash("testpassword123", {
      algorithm: "argon2id",
    });

    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "" }),
    });

    const response = await handleAuthApi(request, "/api/auth/login");
    expect(response!.status).toBe(400);
  });
});

describe("POST /api/auth/logout", () => {
  test("clears session cookie", async () => {
    const request = new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: "session=some-token" },
    });

    const response = await handleAuthApi(request, "/api/auth/logout");
    expect(response!.status).toBe(200);

    const cookie = response!.headers.get("Set-Cookie");
    expect(cookie).toContain("Max-Age=0");
  });
});

describe("GET /api/auth/check", () => {
  test("returns authenticated=false when no session", async () => {
    const request = new Request("http://localhost/api/auth/check");

    const response = await handleAuthApi(request, "/api/auth/check");
    const data = await response!.json();
    expect(data.authenticated).toBe(false);
  });

  test("returns authenticated=true with valid session", async () => {
    storedSessions.set("valid-token", mockSession);

    const request = new Request("http://localhost/api/auth/check", {
      headers: { cookie: "session=valid-token" },
    });

    const response = await handleAuthApi(request, "/api/auth/check");
    const data = await response!.json();
    expect(data.authenticated).toBe(true);
  });

  test("returns needsSetup=true when no password set", async () => {
    const request = new Request("http://localhost/api/auth/check");

    const response = await handleAuthApi(request, "/api/auth/check");
    const data = await response!.json();
    expect(data.needsSetup).toBe(true);
  });

  test("returns needsSetup=false when password is set", async () => {
    storedPasswordHash = "some-hash";

    const request = new Request("http://localhost/api/auth/check");

    const response = await handleAuthApi(request, "/api/auth/check");
    const data = await response!.json();
    expect(data.needsSetup).toBe(false);
  });
});

describe("unmatched routes", () => {
  test("returns null for unknown auth paths", async () => {
    const request = new Request("http://localhost/api/auth/unknown");
    const response = await handleAuthApi(request, "/api/auth/unknown");
    expect(response).toBeNull();
  });
});
