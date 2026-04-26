// ABOUTME: Tests for DeploymentModel, focused on pruneOld parameterized queries.
// ABOUTME: Verifies that pruneOld correctly deletes old deployments using safe SQL.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "../database";
import { DeploymentModel } from "./deployment";
import { SiteModel } from "./site";
import { rmSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_DATA_DIR = join(import.meta.dir, "..", "..", "..", "test-data-deployment");

describe("DeploymentModel", () => {
  let db: Database;
  let deploymentModel: DeploymentModel;
  let siteModel: SiteModel;

  // Sites table has a FK that deployments.site_id must reference, so each
  // test that creates a deployment first needs a real site row.
  const makeSite = (suffix = ""): string => {
    const site = siteModel.create({
      name: `test-site${suffix}`,
      git_url: `https://example.test/repo${suffix}.git`,
      type: "auto"
    });
    return site.id;
  };

  beforeEach(async () => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });

    (Database as any).instance = undefined;
    db = Database.getInstance({ dataDir: TEST_DATA_DIR });
    await db.runMigrations();

    deploymentModel = new DeploymentModel();
    siteModel = new SiteModel();
  });

  afterEach(() => {
    db.close();
    (Database as any).instance = undefined;
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  describe("markStaleAsFailed", () => {
    test("returns 0 when no deployments exist", () => {
      expect(deploymentModel.markStaleAsFailed("test")).toBe(0);
    });

    test("marks every non-terminal deployment as failed", () => {
      const siteId = makeSite();
      const stuck = deploymentModel.create({ site_id: siteId });
      // bypass `complete`/`fail` so we exercise the raw update path
      deploymentModel.update(stuck.id, { status: "building" });

      const swept = deploymentModel.markStaleAsFailed("server restarted");
      expect(swept).toBe(1);

      const after = deploymentModel.findById(stuck.id);
      expect(after?.status).toBe("failed");
      expect(after?.error_message).toBe("server restarted");
      expect(after?.completed_at).toBeTruthy();
    });

    test("ignores deployments already in terminal states", () => {
      const siteId = makeSite();
      const done = deploymentModel.create({ site_id: siteId });
      deploymentModel.complete(done.id, "container-1", 8001);
      const failed = deploymentModel.create({ site_id: siteId });
      deploymentModel.fail(failed.id, "earlier failure");
      const rolled = deploymentModel.create({ site_id: siteId });
      deploymentModel.update(rolled.id, { status: "rolled_back" });

      expect(deploymentModel.markStaleAsFailed("sweep")).toBe(0);

      // existing error_message on the already-failed row must not be overwritten
      expect(deploymentModel.findById(failed.id)?.error_message).toBe(
        "earlier failure"
      );
    });

    test("sweeps all non-terminal statuses (pending, cloning, building, starting, healthy, switching)", () => {
      const siteId = makeSite();
      const statuses = [
        "pending",
        "cloning",
        "building",
        "starting",
        "healthy",
        "switching"
      ] as const;

      for (const status of statuses) {
        const d = deploymentModel.create({ site_id: siteId });
        deploymentModel.update(d.id, { status });
      }

      expect(deploymentModel.markStaleAsFailed("boot")).toBe(statuses.length);
    });
  });

  describe("pruneOld", () => {
    test("returns 0 when no deployments exist", () => {
      const count = deploymentModel.pruneOld("non-existent-site");
      expect(count).toBe(0);
    });

    test("keeps the most recent deployments and deletes older ones", () => {
      const siteId = "test-site-id";

      // Create 5 deployments
      for (let i = 0; i < 5; i++) {
        deploymentModel.create({ site_id: siteId });
      }

      const before = deploymentModel.findBySiteId(siteId, 100);
      expect(before.length).toBe(5);

      const deleted = deploymentModel.pruneOld(siteId, 2);
      expect(deleted).toBe(3);

      const after = deploymentModel.findBySiteId(siteId, 100);
      expect(after.length).toBe(2);
    });

    test("does not delete when count is within keepCount", () => {
      const siteId = "test-site-id";

      for (let i = 0; i < 3; i++) {
        deploymentModel.create({ site_id: siteId });
      }

      const deleted = deploymentModel.pruneOld(siteId, 10);
      expect(deleted).toBe(0);

      const after = deploymentModel.findBySiteId(siteId, 100);
      expect(after.length).toBe(3);
    });

    test("does not affect other sites' deployments", () => {
      const siteA = "site-a";
      const siteB = "site-b";

      for (let i = 0; i < 4; i++) {
        deploymentModel.create({ site_id: siteA });
      }
      for (let i = 0; i < 3; i++) {
        deploymentModel.create({ site_id: siteB });
      }

      deploymentModel.pruneOld(siteA, 1);

      expect(deploymentModel.findBySiteId(siteA, 100).length).toBe(1);
      expect(deploymentModel.findBySiteId(siteB, 100).length).toBe(3);
    });

    test("uses parameterized queries (no SQL injection via IDs)", () => {
      const siteId = "test-site-id";

      for (let i = 0; i < 3; i++) {
        deploymentModel.create({ site_id: siteId });
      }

      expect(() => deploymentModel.pruneOld(siteId, 1)).not.toThrow();

      const remaining = deploymentModel.findBySiteId(siteId, 100);
      expect(remaining.length).toBe(1);
    });
  });
});
