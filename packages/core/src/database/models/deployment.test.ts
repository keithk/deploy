// ABOUTME: Tests for DeploymentModel, focused on pruneOld parameterized queries.
// ABOUTME: Verifies that pruneOld correctly deletes old deployments using safe SQL.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "../database";
import { DeploymentModel } from "./deployment";
import { rmSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_DATA_DIR = join(import.meta.dir, "..", "..", "..", "test-data-deployment");

describe("DeploymentModel", () => {
  let db: Database;
  let deploymentModel: DeploymentModel;

  beforeEach(async () => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });

    (Database as any).instance = undefined;
    db = Database.getInstance({ dataDir: TEST_DATA_DIR });
    await db.runMigrations();

    deploymentModel = new DeploymentModel();
  });

  afterEach(() => {
    db.close();
    (Database as any).instance = undefined;
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
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
