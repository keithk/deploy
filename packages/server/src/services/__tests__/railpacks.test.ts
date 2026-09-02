// ABOUTME: Tests for the railpacks build service.
// ABOUTME: Validates the build function handles paths and errors correctly.

import { describe, test, expect } from "bun:test";
import { buildEnvArgs, buildWithRailpacks } from "../railpacks";

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

    test("uses an explicitly shared image name", async () => {
      const result = await buildWithRailpacks("/nonexistent/path", "my-app", {
        imageName: "deploy-group-123:latest",
      });

      expect(result.imageName).toBe("deploy-group-123:latest");
    });
  });

  describe("buildEnvArgs", () => {
    test("returns nothing when no build variables are set", () => {
      expect(buildEnvArgs()).toEqual([]);
      expect(buildEnvArgs({})).toEqual([]);
    });

    test("emits a --env flag per variable", () => {
      expect(buildEnvArgs({ ATMOBB_CONFIG: "/app/vendor/config.mjs" })).toEqual([
        "--env",
        "ATMOBB_CONFIG=/app/vendor/config.mjs",
      ]);
    });

    test("keeps values containing an equals sign intact", () => {
      expect(buildEnvArgs({ TOKEN: "a=b=c" })).toEqual(["--env", "TOKEN=a=b=c"]);
    });

    test("drops keys that would produce an ambiguous argument", () => {
      expect(buildEnvArgs({ "": "x", "BAD=KEY": "y", GOOD: "z" })).toEqual(["--env", "GOOD=z"]);
    });
  });
});
