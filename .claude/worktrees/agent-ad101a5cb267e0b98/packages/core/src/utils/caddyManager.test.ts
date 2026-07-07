// ABOUTME: Tests for Caddy manager utilities.
// ABOUTME: Validates Caddyfile writing and config update operations.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import {
  writeCaddyfile,
  getDefaultCaddyfilePath,
  updateCaddyConfig,
} from "./caddyManager";

describe("caddyManager", () => {
  const testDir = "/tmp/caddy-test-" + Date.now();
  const testCaddyfilePath = join(testDir, "Caddyfile");

  beforeEach(async () => {
    await Bun.spawn(["mkdir", "-p", testDir]).exited;
  });

  afterEach(async () => {
    await Bun.spawn(["rm", "-rf", testDir]).exited;
  });

  describe("getDefaultCaddyfilePath", () => {
    test("returns config/Caddyfile path relative to project root on non-Linux", async () => {
      // On macOS (darwin), should use local config path
      if (process.platform !== "linux") {
        const path = await getDefaultCaddyfilePath("/my/project");
        expect(path).toBe("/my/project/config/Caddyfile");
      }
    });

    test("uses cwd when no projectRoot provided on non-Linux", async () => {
      if (process.platform !== "linux") {
        const path = await getDefaultCaddyfilePath();
        expect(path).toContain("config/Caddyfile");
      }
    });
  });

  describe("writeCaddyfile", () => {
    test("writes content to specified path", async () => {
      const content = "test content";

      const result = await writeCaddyfile(content, testCaddyfilePath);

      expect(result.success).toBe(true);
      expect(result.caddyfilePath).toBe(testCaddyfilePath);

      const written = await Bun.file(testCaddyfilePath).text();
      expect(written).toBe(content);
    });

    test("creates parent directories if needed", async () => {
      const nestedPath = join(testDir, "nested", "deep", "Caddyfile");
      const content = "nested content";

      const result = await writeCaddyfile(content, nestedPath);

      expect(result.success).toBe(true);

      const written = await Bun.file(nestedPath).text();
      expect(written).toBe(content);
    });
  });

  describe("updateCaddyConfig", () => {
    test("generates and writes Caddyfile with domain", async () => {
      const result = await updateCaddyConfig({
        domain: "test.example.com",
        caddyfilePath: testCaddyfilePath,
      });

      expect(result.success).toBe(true);
      expect(result.caddyfilePath).toBe(testCaddyfilePath);

      const content = await Bun.file(testCaddyfilePath).text();
      expect(content).toContain("test.example.com");
      expect(content).toContain("*.test.example.com");
    });

    test("uses specified port in configuration", async () => {
      const result = await updateCaddyConfig({
        domain: "test.example.com",
        port: 8080,
        caddyfilePath: testCaddyfilePath,
      });

      expect(result.success).toBe(true);

      const content = await Bun.file(testCaddyfilePath).text();
      expect(content).toContain("localhost:8080");
    });

    test("message indicates Caddy not running when applicable", async () => {
      const result = await updateCaddyConfig({
        domain: "test.example.com",
        caddyfilePath: testCaddyfilePath,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Caddy");
    });
  });
});
