// ABOUTME: Tests for ContainerMetricModel covering insert, findBySite ordering,
// ABOUTME: pruneOld retention, and cascade-delete when the parent site is deleted.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "../database";
import { ContainerMetricModel } from "./container-metric";
import { rmSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_DATA_DIR = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "test-data-container-metric"
);

function makeSampleData(
  siteId: string,
  recordedAt: string,
  overrides: Partial<{
    cpu_pct: number;
    mem_bytes: number;
    mem_limit_bytes: number;
    net_rx_bytes: number;
    net_tx_bytes: number;
  }> = {}
) {
  return {
    site_id: siteId,
    recorded_at: recordedAt,
    cpu_pct: overrides.cpu_pct ?? 12.5,
    mem_bytes: overrides.mem_bytes ?? 52428800, // 50 MiB
    mem_limit_bytes: overrides.mem_limit_bytes ?? 536870912, // 512 MiB
    net_rx_bytes: overrides.net_rx_bytes ?? 1024,
    net_tx_bytes: overrides.net_tx_bytes ?? 512,
  };
}

describe("ContainerMetricModel", () => {
  let db: Database;
  let model: ContainerMetricModel;

  beforeEach(async () => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });

    (Database as any).instance = undefined;
    db = Database.getInstance({ dataDir: TEST_DATA_DIR });
    await db.runMigrations();

    model = new ContainerMetricModel();

    // Insert a parent site so FK constraints are satisfied
    db.run(
      `INSERT INTO sites (id, name, git_url, type, env_vars) VALUES (?, ?, ?, ?, ?)`,
      ["site-a", "site-a", "https://example.com/a.git", "auto", "{}"]
    );
    db.run(
      `INSERT INTO sites (id, name, git_url, type, env_vars) VALUES (?, ?, ?, ?, ?)`,
      ["site-b", "site-b", "https://example.com/b.git", "auto", "{}"]
    );
  });

  afterEach(() => {
    db.close();
    (Database as any).instance = undefined;
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  test("insert persists a row retrievable via findBySite", () => {
    const ts = "2026-04-26T10:00:00.000Z";
    model.insert(makeSampleData("site-a", ts));

    const rows = model.findBySite("site-a", "2026-04-26T09:00:00.000Z");
    expect(rows).toHaveLength(1);
    expect(rows[0].site_id).toBe("site-a");
    expect(rows[0].recorded_at).toBe(ts);
    expect(rows[0].cpu_pct).toBe(12.5);
    expect(rows[0].mem_bytes).toBe(52428800);
    expect(rows[0].mem_limit_bytes).toBe(536870912);
    expect(rows[0].net_rx_bytes).toBe(1024);
    expect(rows[0].net_tx_bytes).toBe(512);
    expect(typeof rows[0].id).toBe("string");
    expect(rows[0].id.length).toBeGreaterThan(0);
  });

  test("findBySite returns rows ordered by recorded_at ASC", () => {
    model.insert(makeSampleData("site-a", "2026-04-26T10:00:10.000Z"));
    model.insert(makeSampleData("site-a", "2026-04-26T10:00:00.000Z"));
    model.insert(makeSampleData("site-a", "2026-04-26T10:00:20.000Z"));

    const rows = model.findBySite("site-a", "2026-04-26T09:00:00.000Z");
    expect(rows).toHaveLength(3);
    expect(rows[0].recorded_at).toBe("2026-04-26T10:00:00.000Z");
    expect(rows[1].recorded_at).toBe("2026-04-26T10:00:10.000Z");
    expect(rows[2].recorded_at).toBe("2026-04-26T10:00:20.000Z");
  });

  test("findBySite only returns rows at or after the since timestamp", () => {
    model.insert(makeSampleData("site-a", "2026-04-26T09:59:59.000Z")); // before
    model.insert(makeSampleData("site-a", "2026-04-26T10:00:00.000Z")); // at boundary
    model.insert(makeSampleData("site-a", "2026-04-26T10:00:05.000Z")); // after

    const rows = model.findBySite("site-a", "2026-04-26T10:00:00.000Z");
    expect(rows).toHaveLength(2);
    expect(rows[0].recorded_at).toBe("2026-04-26T10:00:00.000Z");
    expect(rows[1].recorded_at).toBe("2026-04-26T10:00:05.000Z");
  });

  test("findBySite does not return rows belonging to another site", () => {
    model.insert(makeSampleData("site-a", "2026-04-26T10:00:00.000Z"));
    model.insert(makeSampleData("site-b", "2026-04-26T10:00:00.000Z"));

    const rowsA = model.findBySite("site-a", "2026-04-26T09:00:00.000Z");
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].site_id).toBe("site-a");
  });

  test("findBySite respects the limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      const ts = new Date(
        Date.UTC(2026, 3, 26, 10, 0, i * 5)
      ).toISOString();
      model.insert(makeSampleData("site-a", ts));
    }

    const rows = model.findBySite("site-a", "2026-04-26T09:00:00.000Z", 3);
    expect(rows).toHaveLength(3);
  });

  test("pruneOld deletes rows before the given timestamp", () => {
    model.insert(makeSampleData("site-a", "2026-04-19T10:00:00.000Z")); // old
    model.insert(makeSampleData("site-a", "2026-04-19T23:59:59.000Z")); // old
    model.insert(makeSampleData("site-a", "2026-04-20T00:00:00.000Z")); // boundary — kept
    model.insert(makeSampleData("site-a", "2026-04-26T10:00:00.000Z")); // recent

    model.pruneOld("2026-04-20T00:00:00.000Z");

    const rows = model.findBySite("site-a", "2026-01-01T00:00:00.000Z");
    // Rows at or after the cutoff remain; rows strictly before are deleted.
    expect(rows).toHaveLength(2);
    expect(rows[0].recorded_at).toBe("2026-04-20T00:00:00.000Z");
    expect(rows[1].recorded_at).toBe("2026-04-26T10:00:00.000Z");
  });

  test("rows cascade-delete when the parent site is deleted", () => {
    model.insert(makeSampleData("site-a", "2026-04-26T10:00:00.000Z"));
    model.insert(makeSampleData("site-a", "2026-04-26T10:00:05.000Z"));

    expect(model.findBySite("site-a", "2026-01-01T00:00:00.000Z")).toHaveLength(2);

    db.run(`DELETE FROM sites WHERE id = ?`, ["site-a"]);

    expect(model.findBySite("site-a", "2026-01-01T00:00:00.000Z")).toHaveLength(0);
  });

  test("insert generates unique UUIDs for each row", () => {
    model.insert(makeSampleData("site-a", "2026-04-26T10:00:00.000Z"));
    model.insert(makeSampleData("site-a", "2026-04-26T10:00:05.000Z"));

    const rows = model.findBySite("site-a", "2026-01-01T00:00:00.000Z");
    expect(rows[0].id).not.toBe(rows[1].id);
  });
});
