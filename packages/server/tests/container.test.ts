// ABOUTME: Tests for Docker container hardening and cleanup functions.
// ABOUTME: Validates port binding, resource limits, and cleanup behavior.

import { describe, test, expect, mock } from "bun:test";
import { $ } from "bun";

mock.module("@keithk/deploy-core", () => ({
  info: mock(() => {}),
  debug: mock(() => {}),
  error: mock(() => {}),
  siteModel: {
    findAll: mock(() => []),
    findByName: mock(() => null),
  },
}));

const {
  cleanupContainers,
  cleanupSiteContainers,
  startContainer,
  stopContainer,
} = await import("../src/services/container");

describe("cleanupContainers", () => {
  test("returns a result with containersRemoved and imagesRemoved", async () => {
    const result = await cleanupContainers();

    expect(result).toHaveProperty("containersRemoved");
    expect(result).toHaveProperty("imagesRemoved");
    expect(typeof result.containersRemoved).toBe("string");
    expect(typeof result.imagesRemoved).toBe("string");
  });

  test("result strings are not empty", async () => {
    const result = await cleanupContainers();

    // Docker prune always returns some output even if nothing to clean
    expect(result.containersRemoved.length).toBeGreaterThan(0);
    expect(result.imagesRemoved.length).toBeGreaterThan(0);
  });
});

describe("cleanupSiteContainers", () => {
  test("does not throw when no blue-green container exists", async () => {
    // Should not throw even when there's no container to clean up
    await cleanupSiteContainers("nonexistent-test-site-12345");
  });
});

describe("startContainer hardening", () => {
  const testSiteName = "hardening-test-" + Date.now();
  const testImageName = "alpine:latest";

  test("binds port to localhost only and applies resource limits", async () => {
    // Pull alpine for the test
    await $`docker pull alpine:latest`.quiet();

    let containerResult;
    try {
      containerResult = await startContainer(testImageName, testSiteName, {
        envVars: {},
      });

      // Inspect the container to verify settings
      const inspect =
        await $`docker inspect ${containerResult.containerName}`.text();
      const config = JSON.parse(inspect)[0];

      // Verify port is bound to 127.0.0.1 only
      const portBindings = config.HostConfig.PortBindings;
      const portKey = `${containerResult.port}/tcp`;
      expect(portBindings[portKey]).toBeDefined();
      expect(portBindings[portKey][0].HostIp).toBe("127.0.0.1");

      // Verify memory limit (512m = 536870912 bytes)
      expect(config.HostConfig.Memory).toBe(536870912);

      // Verify CPU limit (1 CPU = 1e9 NanoCpus)
      expect(config.HostConfig.NanoCpus).toBe(1000000000);

      // Verify restart policy
      expect(config.HostConfig.RestartPolicy.Name).toBe("unless-stopped");
    } finally {
      // Clean up the test container
      if (containerResult) {
        await stopContainer(testSiteName).catch(() => {});
      }
    }
  });
});
