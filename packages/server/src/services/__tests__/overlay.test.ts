// ABOUTME: Tests for build source validation and overlay application.
// ABOUTME: Covers path-escape rejection and copying host directories into a checkout.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  applyBuildSources,
  resolveDest,
  validateBuildSource,
  validateBuildSources,
} from "../overlay";

describe("overlay service", () => {
  describe("validateBuildSource", () => {
    test("accepts a git source and defaults branch to unset", () => {
      const source = validateBuildSource({
        type: "git",
        source: "https://github.com/keithk/private-plugin.git",
        dest: "vendor/plugin",
      });

      expect(source.type).toBe("git");
      expect(source.dest).toBe("vendor/plugin");
      expect(source.branch).toBeUndefined();
    });

    test("accepts a path source with an absolute source", () => {
      const source = validateBuildSource({
        type: "path",
        source: "/srv/assets",
        dest: "vendor/assets",
      });

      expect(source.source).toBe("/srv/assets");
    });

    test("rejects a relative path source", () => {
      expect(() =>
        validateBuildSource({ type: "path", source: "srv/assets", dest: "vendor/assets" })
      ).toThrow(/must be absolute/);
    });

    test("rejects a source that is not a git URL", () => {
      expect(() =>
        validateBuildSource({ type: "git", source: "/srv/assets", dest: "vendor/plugin" })
      ).toThrow(/must be a git URL/);
    });

    test("rejects an unknown type", () => {
      expect(() =>
        validateBuildSource({ type: "rsync", source: "/srv/assets", dest: "vendor" })
      ).toThrow(/must be "git" or "path"/);
    });

    test("rejects a dest that climbs out of the checkout", () => {
      expect(() =>
        validateBuildSource({ type: "path", source: "/srv/assets", dest: "../../etc" })
      ).toThrow(/inside the site checkout/);
    });

    test("rejects an absolute dest", () => {
      expect(() =>
        validateBuildSource({ type: "path", source: "/srv/assets", dest: "/etc/passwd" })
      ).toThrow(/must be relative/);
    });

    test("rejects a dest that would overwrite git metadata", () => {
      expect(() =>
        validateBuildSource({ type: "path", source: "/srv/assets", dest: ".git/hooks" })
      ).toThrow(/may not write into .git/);
    });

    test("rejects a dest naming the checkout root", () => {
      expect(() =>
        validateBuildSource({ type: "path", source: "/srv/assets", dest: "." })
      ).toThrow(/inside the site checkout/);
    });

    test("normalizes a dest with redundant segments", () => {
      const source = validateBuildSource({
        type: "path",
        source: "/srv/assets",
        dest: "vendor/./assets/",
      });

      expect(source.dest).toBe("vendor/assets");
    });
  });

  describe("validateBuildSources", () => {
    test("rejects two sources writing to the same dest", () => {
      expect(() =>
        validateBuildSources([
          { type: "path", source: "/srv/a", dest: "vendor/x" },
          { type: "path", source: "/srv/b", dest: "vendor/x" },
        ])
      ).toThrow(/both write to vendor\/x/);
    });

    test("rejects a non-array", () => {
      expect(() => validateBuildSources({ type: "path" })).toThrow(/must be an array/);
    });

    test("accepts an empty list", () => {
      expect(validateBuildSources([])).toEqual([]);
    });
  });

  describe("resolveDest", () => {
    test("resolves inside the checkout", () => {
      expect(resolveDest("/var/deploy/sites/app", "vendor/plugin")).toBe(
        "/var/deploy/sites/app/vendor/plugin"
      );
    });

    test("throws when the dest escapes the checkout", () => {
      expect(() => resolveDest("/var/deploy/sites/app", "../other")).toThrow(/escapes/);
    });
  });

  describe("applyBuildSources", () => {
    let root: string;
    let sitePath: string;
    let assets: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), "overlay-test-"));
      sitePath = join(root, "site");
      assets = join(root, "assets");
      await mkdir(sitePath, { recursive: true });
      await mkdir(join(assets, "body"), { recursive: true });
      await writeFile(join(assets, "body", "body-fair.svg"), "<svg />");
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    test("copies a path source into the checkout", async () => {
      await applyBuildSources(
        sitePath,
        [{ type: "path", source: assets, dest: "vendor/assets" }],
        () => {}
      );

      const copied = await readFile(join(sitePath, "vendor/assets/body/body-fair.svg"), "utf8");
      expect(copied).toBe("<svg />");
    });

    test("replaces what a previous deploy left behind", async () => {
      const dest = join(sitePath, "vendor/assets");
      await mkdir(dest, { recursive: true });
      await writeFile(join(dest, "stale.svg"), "old");

      await applyBuildSources(
        sitePath,
        [{ type: "path", source: assets, dest: "vendor/assets" }],
        () => {}
      );

      expect(await Bun.file(join(dest, "stale.svg")).exists()).toBe(false);
      expect(await Bun.file(join(dest, "body/body-fair.svg")).exists()).toBe(true);
    });

    test("fails with a clear message when a path source is missing", async () => {
      await expect(
        applyBuildSources(
          sitePath,
          [{ type: "path", source: join(root, "nope"), dest: "vendor/assets" }],
          () => {}
        )
      ).rejects.toThrow(/not found on this server/);
    });
  });
});
