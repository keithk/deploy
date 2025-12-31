// ABOUTME: Test file for database migrations and schema validation.
// ABOUTME: Verifies that migrations run correctly and create expected tables with proper indexes.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "../database";
import { rmSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_DATA_DIR = join(import.meta.dir, "..", "..", "..", "test-data");

describe("Database Migrations", () => {
  let db: Database;

  beforeEach(() => {
    // Clean up test data directory
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });

    // Reset singleton to get fresh instance
    (Database as any).instance = undefined;
    db = Database.getInstance({ dataDir: TEST_DATA_DIR });
  });

  afterEach(() => {
    db.close();
    (Database as any).instance = undefined;
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  test("runMigrations creates _migrations tracking table", async () => {
    await db.runMigrations();

    const tables = db.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'`
    );
    expect(tables.length).toBe(1);
  });

  test("runMigrations creates sites table with correct columns", async () => {
    await db.runMigrations();

    const columns = db.query<{ name: string; type: string }>(
      `PRAGMA table_info(sites)`
    );
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("name");
    expect(columnNames).toContain("git_url");
    expect(columnNames).toContain("branch");
    expect(columnNames).toContain("type");
    expect(columnNames).toContain("visibility");
    expect(columnNames).toContain("status");
    expect(columnNames).toContain("container_id");
    expect(columnNames).toContain("port");
    expect(columnNames).toContain("env_vars");
    expect(columnNames).toContain("created_at");
    expect(columnNames).toContain("last_deployed_at");
  });

  test("runMigrations creates actions table", async () => {
    await db.runMigrations();

    const columns = db.query<{ name: string }>(
      `PRAGMA table_info(actions)`
    );
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("name");
    expect(columnNames).toContain("type");
    expect(columnNames).toContain("site_id");
    expect(columnNames).toContain("schedule");
    expect(columnNames).toContain("enabled");
  });

  test("runMigrations creates share_links table", async () => {
    await db.runMigrations();

    const columns = db.query<{ name: string }>(
      `PRAGMA table_info(share_links)`
    );
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("site_id");
    expect(columnNames).toContain("token");
    expect(columnNames).toContain("expires_at");
  });

  test("runMigrations creates logs table", async () => {
    await db.runMigrations();

    const columns = db.query<{ name: string }>(
      `PRAGMA table_info(logs)`
    );
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("site_id");
    expect(columnNames).toContain("action_id");
    expect(columnNames).toContain("type");
    expect(columnNames).toContain("content");
    expect(columnNames).toContain("timestamp");
  });

  test("runMigrations creates sessions table", async () => {
    await db.runMigrations();

    const columns = db.query<{ name: string }>(
      `PRAGMA table_info(sessions)`
    );
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("token");
    expect(columnNames).toContain("created_at");
    expect(columnNames).toContain("expires_at");
  });

  test("runMigrations creates settings table", async () => {
    await db.runMigrations();

    const columns = db.query<{ name: string }>(
      `PRAGMA table_info(settings)`
    );
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain("key");
    expect(columnNames).toContain("value");
  });

  test("runMigrations creates required indexes", async () => {
    await db.runMigrations();

    const indexes = db.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`
    );
    const indexNames = indexes.map(i => i.name);

    expect(indexNames).toContain("idx_sites_name");
    expect(indexNames).toContain("idx_share_links_token");
    expect(indexNames).toContain("idx_sessions_token");
    expect(indexNames).toContain("idx_logs_timestamp");
  });

  test("runMigrations is idempotent - running twice doesn't error", async () => {
    await db.runMigrations();
    await db.runMigrations(); // Should not throw

    const migrations = db.query<{ name: string }>(
      `SELECT name FROM _migrations`
    );
    expect(migrations.length).toBe(1);
    expect(migrations[0].name).toBe("001-simplified-schema");
  });

  test("can insert and query sites", async () => {
    await db.runMigrations();

    db.run(`
      INSERT INTO sites (id, name, git_url, type, env_vars)
      VALUES (?, ?, ?, ?, ?)
    `, ["test-id", "my-site", "https://github.com/test/repo.git", "auto", "{}"]);

    const sites = db.query<{ id: string; name: string }>(
      `SELECT id, name FROM sites WHERE id = ?`,
      ["test-id"]
    );

    expect(sites.length).toBe(1);
    expect(sites[0].name).toBe("my-site");
  });
});
