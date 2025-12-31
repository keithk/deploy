// ABOUTME: Test file for Site model CRUD operations.
// ABOUTME: Verifies create, read, update, delete, and status management for sites.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "../database";
import { SiteModel } from "./site";
import { rmSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_DATA_DIR = join(import.meta.dir, "..", "..", "..", "test-data-site");

describe("SiteModel", () => {
  let db: Database;
  let siteModel: SiteModel;

  beforeEach(async () => {
    // Clean up test data directory
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });

    // Reset singleton to get fresh instance
    (Database as any).instance = undefined;
    db = Database.getInstance({ dataDir: TEST_DATA_DIR });
    await db.runMigrations();

    siteModel = new SiteModel();
  });

  afterEach(() => {
    db.close();
    (Database as any).instance = undefined;
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  describe("create", () => {
    test("creates a site with required fields", () => {
      const site = siteModel.create({
        name: "my-site",
        git_url: "https://github.com/test/repo.git",
        type: "auto",
      });

      expect(site.id).toBeDefined();
      expect(site.name).toBe("my-site");
      expect(site.git_url).toBe("https://github.com/test/repo.git");
      expect(site.type).toBe("auto");
      expect(site.branch).toBe("main");
      expect(site.visibility).toBe("private");
      expect(site.status).toBe("stopped");
      expect(site.container_id).toBeNull();
      expect(site.port).toBeNull();
      expect(site.env_vars).toBe("{}");
      expect(site.created_at).toBeDefined();
      expect(site.last_deployed_at).toBeNull();
    });

    test("creates a site with optional fields", () => {
      const site = siteModel.create({
        name: "custom-site",
        git_url: "https://github.com/test/repo.git",
        type: "passthrough",
        branch: "develop",
        visibility: "public",
        env_vars: '{"KEY": "value"}',
      });

      expect(site.branch).toBe("develop");
      expect(site.visibility).toBe("public");
      expect(site.type).toBe("passthrough");
      expect(site.env_vars).toBe('{"KEY": "value"}');
    });

    test("generates a unique UUID for each site", () => {
      const site1 = siteModel.create({
        name: "site-1",
        git_url: "https://github.com/test/repo1.git",
        type: "auto",
      });
      const site2 = siteModel.create({
        name: "site-2",
        git_url: "https://github.com/test/repo2.git",
        type: "auto",
      });

      expect(site1.id).not.toBe(site2.id);
    });
  });

  describe("findById", () => {
    test("finds an existing site by ID", () => {
      const created = siteModel.create({
        name: "findme",
        git_url: "https://github.com/test/repo.git",
        type: "auto",
      });

      const found = siteModel.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe("findme");
    });

    test("returns null for non-existent ID", () => {
      const found = siteModel.findById("non-existent-id");

      expect(found).toBeNull();
    });
  });

  describe("findByName", () => {
    test("finds an existing site by name", () => {
      siteModel.create({
        name: "unique-name",
        git_url: "https://github.com/test/repo.git",
        type: "auto",
      });

      const found = siteModel.findByName("unique-name");

      expect(found).not.toBeNull();
      expect(found!.name).toBe("unique-name");
    });

    test("returns null for non-existent name", () => {
      const found = siteModel.findByName("does-not-exist");

      expect(found).toBeNull();
    });
  });

  describe("findAll", () => {
    test("returns empty array when no sites exist", () => {
      const sites = siteModel.findAll();

      expect(sites).toEqual([]);
    });

    test("returns all sites", () => {
      siteModel.create({
        name: "site-a",
        git_url: "https://github.com/test/a.git",
        type: "auto",
      });
      siteModel.create({
        name: "site-b",
        git_url: "https://github.com/test/b.git",
        type: "passthrough",
      });

      const sites = siteModel.findAll();

      expect(sites.length).toBe(2);
      expect(sites.map(s => s.name).sort()).toEqual(["site-a", "site-b"]);
    });
  });

  describe("update", () => {
    test("updates specified fields", () => {
      const created = siteModel.create({
        name: "original",
        git_url: "https://github.com/test/repo.git",
        type: "auto",
      });

      const updated = siteModel.update(created.id, {
        name: "renamed",
        branch: "develop",
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("renamed");
      expect(updated!.branch).toBe("develop");
      expect(updated!.git_url).toBe("https://github.com/test/repo.git");
    });

    test("returns null for non-existent ID", () => {
      const updated = siteModel.update("non-existent", { name: "new-name" });

      expect(updated).toBeNull();
    });
  });

  describe("delete", () => {
    test("deletes an existing site and returns true", () => {
      const created = siteModel.create({
        name: "to-delete",
        git_url: "https://github.com/test/repo.git",
        type: "auto",
      });

      const result = siteModel.delete(created.id);

      expect(result).toBe(true);
      expect(siteModel.findById(created.id)).toBeNull();
    });

    test("returns false for non-existent ID", () => {
      const result = siteModel.delete("non-existent");

      expect(result).toBe(false);
    });
  });

  describe("updateStatus", () => {
    test("updates status only", () => {
      const created = siteModel.create({
        name: "status-test",
        git_url: "https://github.com/test/repo.git",
        type: "auto",
      });

      siteModel.updateStatus(created.id, "running");

      const found = siteModel.findById(created.id);
      expect(found!.status).toBe("running");
      expect(found!.container_id).toBeNull();
      expect(found!.port).toBeNull();
    });

    test("updates status with container_id and port", () => {
      const created = siteModel.create({
        name: "container-test",
        git_url: "https://github.com/test/repo.git",
        type: "auto",
      });

      siteModel.updateStatus(created.id, "running", "container-abc123", 3000);

      const found = siteModel.findById(created.id);
      expect(found!.status).toBe("running");
      expect(found!.container_id).toBe("container-abc123");
      expect(found!.port).toBe(3000);
    });
  });

  describe("markDeployed", () => {
    test("sets last_deployed_at to current timestamp", () => {
      const created = siteModel.create({
        name: "deploy-test",
        git_url: "https://github.com/test/repo.git",
        type: "auto",
      });
      expect(created.last_deployed_at).toBeNull();

      siteModel.markDeployed(created.id);

      const found = siteModel.findById(created.id);
      expect(found!.last_deployed_at).not.toBeNull();
      // Check it's a valid ISO date string
      expect(new Date(found!.last_deployed_at!).getTime()).not.toBeNaN();
    });
  });
});
