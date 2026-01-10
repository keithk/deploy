// ABOUTME: Tests for the git service.
// ABOUTME: Validates cloning, pulling, and path resolution functions.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { cloneSite, pullSite, getSitePath } from "../git";

const TEST_SITES_DIR = "/tmp/deploy-test-sites";
// Use a small, public repository for integration tests
const TEST_REPO_URL = "https://github.com/octocat/Hello-World.git";

describe("git service", () => {
  beforeEach(() => {
    process.env.SITES_DIR = TEST_SITES_DIR;
    if (existsSync(TEST_SITES_DIR)) {
      rmSync(TEST_SITES_DIR, { recursive: true });
    }
    mkdirSync(TEST_SITES_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_SITES_DIR)) {
      rmSync(TEST_SITES_DIR, { recursive: true });
    }
    delete process.env.SITES_DIR;
  });

  describe("getSitePath", () => {
    test("returns the correct path for a site", () => {
      const path = getSitePath("my-site");
      expect(path).toBe(join(TEST_SITES_DIR, "my-site"));
    });
  });

  describe("cloneSite", () => {
    test("clones a repository to the correct path", async () => {
      const sitePath = await cloneSite(TEST_REPO_URL, "test-clone", "master");

      expect(sitePath).toBe(join(TEST_SITES_DIR, "test-clone"));
      expect(existsSync(sitePath)).toBe(true);
      expect(existsSync(join(sitePath, ".git"))).toBe(true);
    });

    test("throws error for invalid git URL", async () => {
      await expect(
        cloneSite("https://github.com/invalid/nonexistent-repo-12345.git", "invalid-site")
      ).rejects.toThrow("Git clone failed");
    });
  });

  describe("pullSite", () => {
    test("throws error when site does not exist", async () => {
      await expect(pullSite("nonexistent-site")).rejects.toThrow(
        "does not exist"
      );
    });
  });
});
