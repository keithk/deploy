// ABOUTME: Tests for path traversal prevention in static file serving.
// ABOUTME: Verifies that requests with ".." in the path cannot escape the site directory.

import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { SiteConfig } from "@keithk/deploy-core";
import { join } from "path";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";

// Create a temporary site directory for testing
const TEST_SITE_DIR = join(import.meta.dir, "test-site-static");
const TEST_SITE_DIST = join(TEST_SITE_DIR, "dist");

function setupTestSite() {
  if (existsSync(TEST_SITE_DIR)) {
    rmSync(TEST_SITE_DIR, { recursive: true });
  }
  mkdirSync(TEST_SITE_DIST, { recursive: true });
  writeFileSync(join(TEST_SITE_DIR, "index.html"), "<html>Root</html>");
  writeFileSync(join(TEST_SITE_DIST, "index.html"), "<html>Dist</html>");
  writeFileSync(join(TEST_SITE_DIR, "secret.txt"), "secret data");
}

function cleanupTestSite() {
  if (existsSync(TEST_SITE_DIR)) {
    rmSync(TEST_SITE_DIR, { recursive: true });
  }
}

mock.module("@keithk/deploy-core", () => ({
  siteModel: { findByName: () => null },
  info: () => {},
  debug: () => {},
  error: () => {},
  warn: () => {},
}));

mock.module("../src/middleware/auth", () => ({
  checkSiteAccess: () => true,
}));

mock.module("../src/utils/proxy", () => ({
  proxyRequest: () => new Response("Proxied"),
}));

const { setupSubdomainRouting } = await import("../src/routing/subdomainRouter");

describe("Path Traversal Prevention", () => {
  beforeEach(() => {
    setupTestSite();
  });

  test("serves files within the site directory", async () => {
    const site: SiteConfig = {
      subdomain: "test",
      route: "/test",
      path: TEST_SITE_DIST,
      type: "static",
    };

    const context = new Map<string, any>();
    context.set("site", site);

    const request = new Request("http://test.dev.flexi/index.html");
    const config = {
      sites: [site],
      mode: "serve" as const,
      PROJECT_DOMAIN: "dev.flexi",
      webhookPath: "/webhook",
      rootDir: TEST_SITE_DIR,
      actionRegistry: {} as any,
      rootConfig: {},
    };

    const response = await setupSubdomainRouting(request, context, config);
    expect(response.status).toBe(200);
  });

  test("blocks path traversal with .. in static sites", async () => {
    const site: SiteConfig = {
      subdomain: "test",
      route: "/test",
      path: TEST_SITE_DIST,
      type: "static",
    };

    const context = new Map<string, any>();
    context.set("site", site);

    const request = new Request("http://test.dev.flexi/../secret.txt");
    const config = {
      sites: [site],
      mode: "serve" as const,
      PROJECT_DOMAIN: "dev.flexi",
      webhookPath: "/webhook",
      rootDir: TEST_SITE_DIR,
      actionRegistry: {} as any,
      rootConfig: {},
    };

    const response = await setupSubdomainRouting(request, context, config);
    // path.resolve normalizes ".." away, so this should be 403 or 404
    expect([403, 404]).toContain(response.status);
  });

  test("blocks path traversal in static-build sites", async () => {
    const site: SiteConfig = {
      subdomain: "test",
      route: "/test",
      path: TEST_SITE_DIR,
      type: "static-build",
      buildDir: "dist",
    };

    const context = new Map<string, any>();
    context.set("site", site);

    const request = new Request("http://test.dev.flexi/../secret.txt");
    const config = {
      sites: [site],
      mode: "serve" as const,
      PROJECT_DOMAIN: "dev.flexi",
      webhookPath: "/webhook",
      rootDir: TEST_SITE_DIR,
      actionRegistry: {} as any,
      rootConfig: {},
    };

    const response = await setupSubdomainRouting(request, context, config);
    expect([403, 404]).toContain(response.status);
  });

  // Clean up after all tests
  test("cleanup", () => {
    cleanupTestSite();
    expect(true).toBe(true);
  });
});
