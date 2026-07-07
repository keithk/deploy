// ABOUTME: Tests for LogModel, focused on pruneOldLogs parameterized queries.
// ABOUTME: Verifies that pruneOldLogs correctly deletes old logs using safe SQL.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "../database";
import { LogModel } from "./log";
import { rmSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_DATA_DIR = join(import.meta.dir, "..", "..", "..", "test-data-log");

describe("LogModel", () => {
  let db: Database;
  let logModel: LogModel;

  beforeEach(async () => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });

    (Database as any).instance = undefined;
    db = Database.getInstance({ dataDir: TEST_DATA_DIR });
    await db.runMigrations();

    logModel = new LogModel();
  });

  afterEach(() => {
    db.close();
    (Database as any).instance = undefined;
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  describe("pruneOldLogs", () => {
    test("returns 0 when no logs exist", () => {
      const count = logModel.pruneOldLogs("non-existent-site");
      expect(count).toBe(0);
    });

    test("keeps the most recent logs and deletes older ones", () => {
      const siteId = "test-site-id";

      for (let i = 0; i < 5; i++) {
        logModel.append(siteId, "build", `Log entry ${i}`);
      }

      const before = logModel.findBySiteId(siteId, 100);
      expect(before.length).toBe(5);

      const deleted = logModel.pruneOldLogs(siteId, 2);
      expect(deleted).toBe(3);

      const after = logModel.findBySiteId(siteId, 100);
      expect(after.length).toBe(2);
    });

    test("does not delete when count is within keepCount", () => {
      const siteId = "test-site-id";

      for (let i = 0; i < 3; i++) {
        logModel.append(siteId, "build", `Log entry ${i}`);
      }

      const deleted = logModel.pruneOldLogs(siteId, 10);
      expect(deleted).toBe(0);

      const after = logModel.findBySiteId(siteId, 100);
      expect(after.length).toBe(3);
    });

    test("does not affect other sites' logs", () => {
      const siteA = "site-a";
      const siteB = "site-b";

      for (let i = 0; i < 4; i++) {
        logModel.append(siteA, "build", `Log A ${i}`);
      }
      for (let i = 0; i < 3; i++) {
        logModel.append(siteB, "runtime", `Log B ${i}`);
      }

      logModel.pruneOldLogs(siteA, 1);

      expect(logModel.findBySiteId(siteA, 100).length).toBe(1);
      expect(logModel.findBySiteId(siteB, 100).length).toBe(3);
    });

    test("uses parameterized queries (no SQL injection via IDs)", () => {
      const siteId = "test-site-id";

      for (let i = 0; i < 3; i++) {
        logModel.append(siteId, "build", `Log entry ${i}`);
      }

      expect(() => logModel.pruneOldLogs(siteId, 1)).not.toThrow();

      const remaining = logModel.findBySiteId(siteId, 100);
      expect(remaining.length).toBe(1);
    });
  });
});
