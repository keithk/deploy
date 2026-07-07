// ABOUTME: Tests for the railpacks build service.
// ABOUTME: Validates the build function handles paths and errors correctly.

import { describe, test, expect } from "bun:test";
import { buildWithRailpacks } from "../railpacks";

describe("railpacks service", () => {
  describe("buildWithRailpacks", () => {
    test("returns error when site path does not exist", async () => {
      const result = await buildWithRailpacks("/nonexistent/path", "test-site");

      expect(result.success).toBe(false);
      expect(result.imageName).toBe("deploy-test-site:latest");
      expect(result.error).toContain("does not exist");
    });

    test("generates correct image name", async () => {
      const result = await buildWithRailpacks("/nonexistent/path", "my-app");

      expect(result.imageName).toBe("deploy-my-app:latest");
    });
  });
});
