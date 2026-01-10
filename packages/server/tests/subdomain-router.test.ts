// ABOUTME: Tests for the database-backed subdomain router.
// ABOUTME: Validates site lookup, access control, proxying, and status pages.

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

let mockSiteFindByName: ReturnType<typeof mock>;
let mockCheckSiteAccess: ReturnType<typeof mock>;
let mockProxyRequest: ReturnType<typeof mock>;

mockSiteFindByName = mock((name: string) => {
  if (name === "running-site") return mockRunningSite;
  if (name === "stopped-site") return mockStoppedSite;
  if (name === "building-site") return mockBuildingSite;
  if (name === "private-site") return mockPrivateSite;
  return null;
});

mockCheckSiteAccess = mock((_req: Request, siteName: string) => {
  // Private sites require authentication
  const site = mockSiteFindByName(siteName);
  if (site && site.visibility === "private") {
    return false; // Not authenticated
  }
  return true;
});

mockProxyRequest = mock((_req: Request, _port: number) => {
  return new Response("Proxied content", { status: 200 });
});

mock.module("@keithk/deploy-core", () => ({
  siteModel: {
    findByName: mockSiteFindByName,
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

const { handleSubdomainRequest } = await import(
  "../src/routing/subdomainRouter"
);

function createRequest(subdomain: string, domain = "dev.flexi"): Request {
  return new Request(`http://${subdomain}.${domain}/`, {
    headers: { host: `${subdomain}.${domain}` },
  });
}

describe("handleSubdomainRequest", () => {
  beforeEach(() => {
    mockProxyRequest.mockClear();
    mockCheckSiteAccess.mockClear();
    mockSiteFindByName.mockClear();
  });

  test("returns 404 for non-existent site", async () => {
    const request = createRequest("nonexistent");
    const response = await handleSubdomainRequest(request, "dev.flexi");

    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toContain("not found");
  });

  test("proxies running site to container port", async () => {
    const request = createRequest("running-site");
    const response = await handleSubdomainRequest(request, "dev.flexi");

    expect(response.status).toBe(200);
    expect(mockProxyRequest).toHaveBeenCalledWith(request, 8080);
  });

  test("shows status page for stopped site", async () => {
    const request = createRequest("stopped-site");
    const response = await handleSubdomainRequest(request, "dev.flexi");

    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain("stopped");
  });

  test("shows status page for building site", async () => {
    const request = createRequest("building-site");
    const response = await handleSubdomainRequest(request, "dev.flexi");

    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain("building");
  });

  test("returns 403 for private site without auth", async () => {
    const request = createRequest("private-site");
    const response = await handleSubdomainRequest(request, "dev.flexi");

    expect(response.status).toBe(403);
    expect(mockCheckSiteAccess).toHaveBeenCalled();
  });
});
