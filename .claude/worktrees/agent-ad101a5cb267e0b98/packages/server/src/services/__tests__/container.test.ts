// ABOUTME: Tests for the container management service.
// ABOUTME: Validates container lifecycle operations and port allocation.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  startContainer,
  stopContainer,
  getContainerLogs,
  isContainerRunning,
} from "../container";

// These tests require Docker to be running
const DOCKER_AVAILABLE = await checkDockerAvailable();

async function checkDockerAvailable(): Promise<boolean> {
  try {
    const { $ } = await import("bun");
    await $`docker info`.quiet();
    return true;
  } catch {
    return false;
  }
}

describe("container service", () => {
  describe("isContainerRunning", () => {
    test("returns false for non-existent container", async () => {
      const running = await isContainerRunning("nonexistent-site-xyz");
      expect(running).toBe(false);
    });
  });

  describe("getContainerLogs", () => {
    test("throws error for non-existent container", async () => {
      await expect(getContainerLogs("nonexistent-site-xyz")).rejects.toThrow(
        "Failed to get container logs"
      );
    });
  });

  // Integration tests that require Docker
  describe.skipIf(!DOCKER_AVAILABLE)("integration tests", () => {
    const testSiteName = "test-container-service";

    afterEach(async () => {
      // Clean up any test containers
      await stopContainer(testSiteName).catch(() => {});
    });

    test("starts and stops a container", async () => {
      // Use a simple alpine image for testing
      const result = await startContainer("alpine:latest", testSiteName, {});

      expect(result.containerId).toBeTruthy();
      expect(result.port).toBeGreaterThanOrEqual(8000);

      // Verify container is running
      const running = await isContainerRunning(testSiteName);
      expect(running).toBe(true);

      // Stop the container
      await stopContainer(testSiteName);

      // Verify container is stopped
      const stillRunning = await isContainerRunning(testSiteName);
      expect(stillRunning).toBe(false);
    });
  });
});
