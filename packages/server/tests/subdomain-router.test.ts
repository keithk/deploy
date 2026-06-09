// ABOUTME: Tests for the database-backed subdomain router.
// ABOUTME: Validates site lookup, access control, proxying, status pages, and the deploy-screen status endpoint.

import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { Site } from "@keithk/deploy-core";

const mockRunningSite: Site = {
  id: "site-running-id",
  name: "running-site",
  git_url: "https://github.com/test/repo",
  branch: "main",
  type: "auto",
  visibility: "public",
  status: "running",
  container_id: "abc123",
  port: 8080,
  env_vars: "{}",
  created_at: new Date().toISOString(),
  last_deployed_at: new Date().toISOString(),
};

const mockStoppedSite: Site = {
  id: "site-stopped-id",
  name: "stopped-site",
  git_url: "https://github.com/test/repo",
  branch: "main",
  type: "auto",
  visibility: "public",
  status: "stopped",
  container_id: null,
  port: null,
  env_vars: "{}",
  created_at: new Date().toISOString(),
  last_deployed_at: null,
};

const mockBuildingSite: Site = {
  id: "site-building-id",
  name: "building-site",
  git_url: "https://github.com/test/repo",
  branch: "main",
  type: "auto",
  visibility: "public",
  status: "building",
  container_id: null,
  port: null,
  env_vars: "{}",
  created_at: new Date().toISOString(),
  last_deployed_at: null,
};

const mockSleepingSite: Site = {
  id: "site-sleeping-id",
  name: "sleeping-site",
  git_url: "https://github.com/test/repo",
  branch: "main",
  type: "auto",
  visibility: "public",
  status: "sleeping",
  container_id: "ghi789",
  port: null,
  env_vars: "{}",
  created_at: new Date().toISOString(),
  last_deployed_at: new Date().toISOString(),
};

const mockPrivateSite: Site = {
  id: "site-private-id",
  name: "private-site",
  git_url: "https://github.com/test/repo",
  branch: "main",
  type: "auto",
  visibility: "private",
  status: "running",
  container_id: "def456",
  port: 8081,
  env_vars: "{}",
  created_at: new Date().toISOString(),
  last_deployed_at: new Date().toISOString(),
};

const sitesByName: Record<string, Site> = {
  "running-site": mockRunningSite,
  "stopped-site": mockStoppedSite,
  "building-site": mockBuildingSite,
  "sleeping-site": mockSleepingSite,
  "private-site": mockPrivateSite,
};

const mockSiteFindByName = mock((name: string) => sitesByName[name] || null);
const mockUpdateLastRequest = mock(() => {});

const mockCheckSiteAccess = mock((_req: Request, siteName: string) => {
  // Private sites require authentication
  const site = mockSiteFindByName(siteName);
  if (site && site.visibility === "private") {
    return false; // Not authenticated
  }
  return true;
});

const mockProxyRequest = mock(() => {
  return new Response("Proxied content", { status: 200 });
});

const mockWakeSite = mock(() => Promise.resolve());

mock.module("@keithk/deploy-core", () => ({
  siteModel: {
    findByName: mockSiteFindByName,
    updateLastRequest: mockUpdateLastRequest,
  },
  info: () => {},
  debug: () => {},
  error: () => {},
  warn: () => {},
}));

mock.module("../src/middleware/auth", () => ({
  checkSiteAccess: mockCheckSiteAccess,
}));

mock.module("../src/utils/proxy", () => ({
  proxyRequest: mockProxyRequest,
}));

mock.module("../src/services/wake", () => ({
  wakeSite: mockWakeSite,
}));

const { handleSubdomainRequest } = await import(
  "../src/routing/subdomainRouter"
);

const mockServer = {} as any;

function createRequest(
  subdomain: string,
  path = "/",
  domain = "dev.flexi"
): Request {
  return new Request(`http://${subdomain}.${domain}${path}`, {
    headers: { host: `${subdomain}.${domain}` },
  });
}

describe("handleSubdomainRequest", () => {
  beforeEach(() => {
    mockProxyRequest.mockClear();
    mockCheckSiteAccess.mockClear();
    mockSiteFindByName.mockClear();
    mockWakeSite.mockClear();
  });

  test("returns 404 for non-existent site", async () => {
    const request = createRequest("nonexistent");
    const response = await handleSubdomainRequest(
      mockServer,
      request,
      "dev.flexi"
    );

    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toContain("not found");
  });

  test("proxies running site to container port", async () => {
    const request = createRequest("running-site");
    const response = await handleSubdomainRequest(
      mockServer,
      request,
      "dev.flexi"
    );

    expect(response.status).toBe(200);
    expect(mockProxyRequest).toHaveBeenCalledWith(request, 8080, mockServer);
  });

  test("shows status page for stopped site", async () => {
    const request = createRequest("stopped-site");
    const response = await handleSubdomainRequest(
      mockServer,
      request,
      "dev.flexi"
    );

    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain("stopped");
  });

  test("shows deploy screen with polling for building site", async () => {
    const request = createRequest("building-site");
    const response = await handleSubdomainRequest(
      mockServer,
      request,
      "dev.flexi"
    );

    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain("deploying");
    expect(text).toContain("/__deploy/status");
    expect(text).toContain("refresh automatically");
  });

  test("shows wake screen with polling and triggers wake for sleeping site", async () => {
    const request = createRequest("sleeping-site");
    const response = await handleSubdomainRequest(
      mockServer,
      request,
      "dev.flexi"
    );

    expect(response.status).toBe(503);
    expect(mockWakeSite).toHaveBeenCalledWith("site-sleeping-id");
    const text = await response.text();
    expect(text).toContain("waking up");
    expect(text).toContain("/__deploy/status");
    expect(text).toContain("refresh automatically");
  });

  test("returns 403 for private site without auth", async () => {
    const request = createRequest("private-site");
    const response = await handleSubdomainRequest(
      mockServer,
      request,
      "dev.flexi"
    );

    expect(response.status).toBe(403);
    expect(mockCheckSiteAccess).toHaveBeenCalled();
  });

  describe("/__deploy/status endpoint", () => {
    test("returns JSON status for building site", async () => {
      const request = createRequest("building-site", "/__deploy/status");
      const response = await handleSubdomainRequest(
        mockServer,
        request,
        "dev.flexi"
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "building" });
    });

    test("returns JSON status for sleeping site without re-triggering wake", async () => {
      const request = createRequest("sleeping-site", "/__deploy/status");
      const response = await handleSubdomainRequest(
        mockServer,
        request,
        "dev.flexi"
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "sleeping" });
      expect(mockWakeSite).not.toHaveBeenCalled();
    });

    test("returns JSON status for running site instead of proxying", async () => {
      const request = createRequest("running-site", "/__deploy/status");
      const response = await handleSubdomainRequest(
        mockServer,
        request,
        "dev.flexi"
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "running" });
      expect(mockProxyRequest).not.toHaveBeenCalled();
    });

    test("requires auth for private sites", async () => {
      const request = createRequest("private-site", "/__deploy/status");
      const response = await handleSubdomainRequest(
        mockServer,
        request,
        "dev.flexi"
      );

      expect(response.status).toBe(403);
    });
  });
});
