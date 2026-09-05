// ABOUTME: Tests for the sites REST API endpoints.
// ABOUTME: Validates CRUD operations, deployment triggers, share links, and env var updates.

import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock data
const mockSite = {
  id: "site-id-123",
  name: "test-site",
  git_url: "https://github.com/test/repo",
  branch: "main",
  type: "auto" as const,
  visibility: "private" as const,
  status: "stopped" as const,
  container_id: null,
  port: null,
  env_vars: "{}",
  build_sources: "[]",
  database_name: null,
  database_url: null,
  created_at: new Date().toISOString(),
  last_deployed_at: null,
};

const mockSession = {
  token: "valid-token-123",
  id: "session-id",
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

const mockShareLink = {
  id: "share-link-id",
  site_id: "site-id-123",
  token: "share-token-abc",
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

let mockSiteCreate: ReturnType<typeof mock>;
let mockSiteFindById: ReturnType<typeof mock>;
let mockSiteFindByName: ReturnType<typeof mock>;
let mockSiteFindAll: ReturnType<typeof mock>;
let mockSiteUpdate: ReturnType<typeof mock>;
let mockSiteDelete: ReturnType<typeof mock>;
let mockSiteMarkDeployed: ReturnType<typeof mock>;
let mockMetricsFindLatestBySiteIds: ReturnType<typeof mock>;
let mockShareLinkCreate: ReturnType<typeof mock>;
let mockSessionFindByToken: ReturnType<typeof mock>;
let mockDeploySite: ReturnType<typeof mock>;

mock.module("@keithk/deploy-core", () => {
  mockSiteCreate = mock((data: any) => ({
    ...mockSite,
    name: data.name,
    git_url: data.git_url,
  }));

  mockSiteFindById = mock((id: string) => {
    if (id === "site-id-123") return mockSite;
    if (id === "site-id-456") return { ...mockSite, id: "site-id-456", name: "other-site" };
    return null;
  });

  mockSiteFindByName = mock((name: string) => {
    if (name === "test-site") return mockSite;
    if (name === "existing-site") return { ...mockSite, name: "existing-site" };
    return null;
  });

  mockSiteFindAll = mock(() => [mockSite]);

  mockSiteUpdate = mock((id: string, data: any) => {
    if (id === "site-id-123") {
      return { ...mockSite, ...data };
    }
    return null;
  });

  mockSiteDelete = mock((id: string) => id === "site-id-123");

  mockSiteMarkDeployed = mock(() => undefined);

  mockMetricsFindLatestBySiteIds = mock(() => new Map([
    ["site-id-123", {
      site_id: "site-id-123",
      cpu_pct: 12.5,
      mem_bytes: 134_217_728,
      mem_limit_bytes: 536_870_912,
    }],
  ]));

  mockShareLinkCreate = mock((siteId: string, hours?: number) => ({
    ...mockShareLink,
    site_id: siteId,
  }));

  mockSessionFindByToken = mock((token: string) => {
    if (token === "valid-token-123") return mockSession;
    return null;
  });

  return {
    siteModel: {
      create: mockSiteCreate,
      findById: mockSiteFindById,
      findByName: mockSiteFindByName,
      findAll: mockSiteFindAll,
      update: mockSiteUpdate,
      delete: mockSiteDelete,
      markDeployed: mockSiteMarkDeployed,
    },
    containerMetricModel: {
      findLatestBySiteIds: mockMetricsFindLatestBySiteIds,
    },
    logModel: {
      findBySiteId: mock(() => []),
      findBySiteIdAndType: mock(() => []),
    },
    shareLinkModel: {
      create: mockShareLinkCreate,
    },
    sessionModel: {
      findByToken: mockSessionFindByToken,
    },
    logModel: {
      append: () => {},
      findBySiteId: () => [],
      pruneOldLogs: () => {},
    },
    settingsModel: {
      get: () => undefined,
      set: () => {},
    },
    parseCustomDomains: (site: any) => {
      try {
        const domains = JSON.parse(site.custom_domains || "[]");
        return Array.isArray(domains) ? domains : [];
      } catch {
        return [];
      }
    },
    parseBuildSources: (site: any) => {
      try {
        const sources = JSON.parse(site.build_sources || "[]");
        return Array.isArray(sources) ? sources : [];
      } catch {
        return [];
      }
    },
    error: () => {},
    info: () => {},
    debug: () => {},
    warn: () => {},
  };
});

// Create the deploySite mock before module mocking
mockDeploySite = mock((siteId: string) =>
  Promise.resolve({ success: true })
);

mock.module("../src/services/deploy", () => {
  return {
    deploySite: mockDeploySite,
  };
});

const mockAttachDatabase = mock((site: any) =>
  Promise.resolve({ ...site, database_name: "site_test_site", database_url: "postgres://site_test_site:pw@db/site_test_site" })
);
const mockDetachDatabase = mock((site: any, options?: { drop?: boolean }) =>
  Promise.resolve({ ...site, database_url: null, database_name: options?.drop ? null : site.database_name })
);

mock.module("../src/services/database", () => {
  return {
    attachDatabase: mockAttachDatabase,
    detachDatabase: mockDetachDatabase,
  };
});

// Import after mocking
const { handleSitesApi } = await import("../src/api/sites");

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

describe("GET /api/sites", () => {
  test("returns all sites when authenticated", async () => {
    const request = createAuthenticatedRequest("http://localhost/api/sites");
    const response = await handleSitesApi(request, "/api/sites");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);

    const body = await response!.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].name).toBe("test-site");
    expect(body[0].cpu_pct).toBe(12.5);
    expect(body[0].mem_pct).toBe(25);
  });

  test("returns 401 when not authenticated", async () => {
    const request = new Request("http://localhost/api/sites");
    const response = await handleSitesApi(request, "/api/sites");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });
});

describe("POST /api/sites", () => {
  test("creates a new site when authenticated", async () => {
    const request = createAuthenticatedRequest("http://localhost/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ git_url: "https://github.com/new/repo", name: "new-site" }),
    });
    const response = await handleSitesApi(request, "/api/sites");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(201);

    const body = await response!.json();
    expect(body.name).toBe("new-site");
    expect(body.git_url).toBe("https://github.com/new/repo");
  });

  test("returns 400 when git_url is missing", async () => {
    const request = createAuthenticatedRequest("http://localhost/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "new-site" }),
    });
    const response = await handleSitesApi(request, "/api/sites");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(400);
  });

  test("returns 400 when name is missing", async () => {
    const request = createAuthenticatedRequest("http://localhost/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ git_url: "https://github.com/new/repo" }),
    });
    const response = await handleSitesApi(request, "/api/sites");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(400);
  });

  test("returns 409 when site name already exists", async () => {
    const request = createAuthenticatedRequest("http://localhost/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ git_url: "https://github.com/new/repo", name: "existing-site" }),
    });
    const response = await handleSitesApi(request, "/api/sites");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(409);
  });

  test("returns 401 when not authenticated", async () => {
    const request = new Request("http://localhost/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ git_url: "https://github.com/new/repo", name: "new-site" }),
    });
    const response = await handleSitesApi(request, "/api/sites");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });
});

describe("GET /api/sites/:id", () => {
  test("returns a single site when authenticated", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123"
    );
    const response = await handleSitesApi(request, "/api/sites/site-id-123");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);

    const body = await response!.json();
    expect(body.id).toBe("site-id-123");
    expect(body.name).toBe("test-site");
  });

  test("returns 404 when site not found", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/non-existent"
    );
    const response = await handleSitesApi(request, "/api/sites/non-existent");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });

  test("returns 401 when not authenticated", async () => {
    const request = new Request("http://localhost/api/sites/site-id-123");
    const response = await handleSitesApi(request, "/api/sites/site-id-123");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });
});

describe("PATCH /api/sites/:id", () => {
  test("updates a site when authenticated", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "updated-site" }),
      }
    );
    const response = await handleSitesApi(request, "/api/sites/site-id-123");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);

    const body = await response!.json();
    expect(body.name).toBe("updated-site");
  });

  test("returns 404 when site not found", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/non-existent",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "updated-site" }),
      }
    );
    const response = await handleSitesApi(request, "/api/sites/non-existent");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });

  test("returns 401 when not authenticated", async () => {
    const request = new Request("http://localhost/api/sites/site-id-123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "updated-site" }),
    });
    const response = await handleSitesApi(request, "/api/sites/site-id-123");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });
});

describe("DELETE /api/sites/:id", () => {
  test("deletes a site when authenticated", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123",
      { method: "DELETE" }
    );
    const response = await handleSitesApi(request, "/api/sites/site-id-123");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(204);
  });

  test("returns 404 when site not found", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/non-existent",
      { method: "DELETE" }
    );
    const response = await handleSitesApi(request, "/api/sites/non-existent");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });

  test("returns 401 when not authenticated", async () => {
    const request = new Request("http://localhost/api/sites/site-id-123", {
      method: "DELETE",
    });
    const response = await handleSitesApi(request, "/api/sites/site-id-123");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });
});

describe("POST /api/sites/:id/deploy", () => {
  test("triggers deployment when authenticated", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123/deploy",
      { method: "POST" }
    );
    const response = await handleSitesApi(
      request,
      "/api/sites/site-id-123/deploy"
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);

    const body = await response!.json();
    expect(body.message).toBeDefined();
    expect(body.site_id).toBe("site-id-123");

    // Verify deploySite was called with the correct site ID
    expect(mockDeploySite).toHaveBeenCalledWith("site-id-123");
  });

  test("returns 404 when site not found", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/non-existent/deploy",
      { method: "POST" }
    );
    const response = await handleSitesApi(
      request,
      "/api/sites/non-existent/deploy"
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });

  test("returns 401 when not authenticated", async () => {
    const request = new Request("http://localhost/api/sites/site-id-123/deploy", {
      method: "POST",
    });
    const response = await handleSitesApi(
      request,
      "/api/sites/site-id-123/deploy"
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });
});

describe("POST /api/sites/:id/share", () => {
  test("creates share link when authenticated", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123/share",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    const response = await handleSitesApi(
      request,
      "/api/sites/site-id-123/share"
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(201);

    const body = await response!.json();
    expect(body.token).toBeDefined();
    expect(body.expires_at).toBeDefined();
  });

  test("creates share link with custom hours", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123/share",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: 48 }),
      }
    );
    const response = await handleSitesApi(
      request,
      "/api/sites/site-id-123/share"
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(201);
  });

  test("returns 404 when site not found", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/non-existent/share",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    const response = await handleSitesApi(
      request,
      "/api/sites/non-existent/share"
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });

  test("returns 401 when not authenticated", async () => {
    const request = new Request("http://localhost/api/sites/site-id-123/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await handleSitesApi(
      request,
      "/api/sites/site-id-123/share"
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });
});

describe("PATCH /api/sites/:id/env", () => {
  test("updates env vars when authenticated", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123/env",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ DATABASE_URL: "postgres://..." }),
      }
    );
    const response = await handleSitesApi(
      request,
      "/api/sites/site-id-123/env"
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
  });

  test("returns 404 when site not found", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/non-existent/env",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ DATABASE_URL: "postgres://..." }),
      }
    );
    const response = await handleSitesApi(
      request,
      "/api/sites/non-existent/env"
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });

  test("returns 401 when not authenticated", async () => {
    const request = new Request("http://localhost/api/sites/site-id-123/env", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ DATABASE_URL: "postgres://..." }),
    });
    const response = await handleSitesApi(
      request,
      "/api/sites/site-id-123/env"
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });
});

describe("GET /api/sites/:id/build-sources", () => {
  test("returns an empty list for a site with none configured", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123/build-sources"
    );
    const response = await handleSitesApi(
      request,
      "/api/sites/site-id-123/build-sources"
    );

    expect(response!.status).toBe(200);
    expect(await response!.json()).toEqual({ build_sources: [] });
  });

  test("returns 404 when site not found", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/non-existent/build-sources"
    );
    const response = await handleSitesApi(
      request,
      "/api/sites/non-existent/build-sources"
    );

    expect(response!.status).toBe(404);
  });
});

describe("PUT /api/sites/:id/build-sources", () => {
  function putBuildSources(buildSources: unknown, siteId = "site-id-123") {
    const request = createAuthenticatedRequest(
      `http://localhost/api/sites/${siteId}/build-sources`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ build_sources: buildSources }),
      }
    );
    return handleSitesApi(request, `/api/sites/${siteId}/build-sources`);
  }

  test("replaces the list", async () => {
    const response = await putBuildSources([
      {
        type: "git",
        source: "https://github.com/keithk/private-plugin.git",
        dest: "vendor/plugin",
      },
      { type: "path", source: "/srv/assets", dest: "vendor/assets" },
    ]);

    expect(response!.status).toBe(200);
    const body = await response!.json();
    expect(body.build_sources).toHaveLength(2);
    expect(body.build_sources[1]).toEqual({
      type: "path",
      source: "/srv/assets",
      dest: "vendor/assets",
    });
  });

  test("clears the list when given an empty array", async () => {
    const response = await putBuildSources([]);

    expect(response!.status).toBe(200);
    expect((await response!.json()).build_sources).toEqual([]);
  });

  test("rejects a dest that escapes the checkout", async () => {
    const response = await putBuildSources([
      { type: "path", source: "/srv/assets", dest: "../../etc" },
    ]);

    expect(response!.status).toBe(400);
    expect((await response!.json()).error).toMatch(/inside the site checkout/);
  });

  test("rejects a path source that is not absolute", async () => {
    const response = await putBuildSources([
      { type: "path", source: "assets", dest: "vendor/assets" },
    ]);

    expect(response!.status).toBe(400);
  });

  test("returns 404 when site not found", async () => {
    const response = await putBuildSources([], "non-existent");

    expect(response!.status).toBe(404);
  });
});

describe("PATCH /api/sites/:id with build_sources", () => {
  test("rejects an invalid entry", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          build_sources: [{ type: "path", source: "/srv/assets", dest: ".git/hooks" }],
        }),
      }
    );
    const response = await handleSitesApi(request, "/api/sites/site-id-123");

    expect(response!.status).toBe(400);
    expect((await response!.json()).error).toMatch(/may not write into .git/);
  });
});

describe("handleSitesApi routing", () => {
  test("returns null for non-sites paths", async () => {
    const request = createAuthenticatedRequest("http://localhost/api/other");
    const response = await handleSitesApi(request, "/api/other");

    expect(response).toBeNull();
  });
});

describe("site database", () => {
  beforeEach(() => {
    mockAttachDatabase.mockClear();
    mockDetachDatabase.mockClear();
  });

  test("POST /api/sites/:id/database attaches and reports the database name", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123/database",
      { method: "POST" }
    );
    const response = await handleSitesApi(request, "/api/sites/site-id-123/database");

    expect(response!.status).toBe(200);
    expect(await response!.json()).toMatchObject({ database_name: "site_test_site" });
    expect(mockAttachDatabase).toHaveBeenCalledTimes(1);
  });

  test("POST /api/sites/:id/database returns 404 for an unknown site", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/non-existent/database",
      { method: "POST" }
    );
    const response = await handleSitesApi(request, "/api/sites/non-existent/database");

    expect(response!.status).toBe(404);
    expect(mockAttachDatabase).not.toHaveBeenCalled();
  });

  test("POST /api/sites/:id/database surfaces provisioning errors", async () => {
    mockAttachDatabase.mockImplementationOnce(() =>
      Promise.reject(new Error("No database server is registered. Add one in Settings first."))
    );
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123/database",
      { method: "POST" }
    );
    const response = await handleSitesApi(request, "/api/sites/site-id-123/database");

    expect(response!.status).toBe(500);
    expect((await response!.json()).error).toContain("No database server");
  });

  test("DELETE /api/sites/:id/database detaches without dropping by default", async () => {
    mockSiteFindById.mockImplementationOnce(() => ({
      ...mockSite,
      database_name: "site_test_site",
      database_url: "postgres://x",
    }));
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123/database",
      { method: "DELETE" }
    );
    const response = await handleSitesApi(request, "/api/sites/site-id-123/database");

    expect(response!.status).toBe(200);
    expect(mockDetachDatabase).toHaveBeenCalledTimes(1);
    expect(mockDetachDatabase.mock.calls[0][1]).toEqual({ drop: false });
  });

  test("DELETE /api/sites/:id/database?drop=true drops the database", async () => {
    mockSiteFindById.mockImplementationOnce(() => ({
      ...mockSite,
      database_name: "site_test_site",
      database_url: "postgres://x",
    }));
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123/database?drop=true",
      { method: "DELETE" }
    );
    const response = await handleSitesApi(request, "/api/sites/site-id-123/database");

    expect(response!.status).toBe(200);
    expect(mockDetachDatabase.mock.calls[0][1]).toEqual({ drop: true });
  });

  test("DELETE /api/sites/:id/database is a 400 when nothing is attached", async () => {
    const request = createAuthenticatedRequest(
      "http://localhost/api/sites/site-id-123/database",
      { method: "DELETE" }
    );
    const response = await handleSitesApi(request, "/api/sites/site-id-123/database");

    expect(response!.status).toBe(400);
    expect(mockDetachDatabase).not.toHaveBeenCalled();
  });

  test("GET /api/sites/:id hides the connection string but reports attachment", async () => {
    mockSiteFindById.mockImplementationOnce(() => ({
      ...mockSite,
      database_name: "site_test_site",
      database_url: "postgres://site_test_site:secret@db/site_test_site",
    }));
    const request = createAuthenticatedRequest("http://localhost/api/sites/site-id-123");
    const response = await handleSitesApi(request, "/api/sites/site-id-123");
    const body = await response!.json();

    expect(body.database_url).toBeUndefined();
    expect(body.database_attached).toBe(true);
    expect(body.database_name).toBe("site_test_site");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
