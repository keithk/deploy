// ABOUTME: Migration adding sleep/wake columns to sites table and default settings.
// ABOUTME: Enables sites to be automatically put to sleep after inactivity and woken on request.

import type { Database } from "../database";

export const name = "007-sleep-wake";

export function up(db: Database): void {
  // Add sleep columns to sites table
  db.run(`ALTER TABLE sites ADD COLUMN sleep_enabled INTEGER NOT NULL DEFAULT 0`);
  db.run(`ALTER TABLE sites ADD COLUMN sleep_after_minutes INTEGER DEFAULT NULL`);
  db.run(`ALTER TABLE sites ADD COLUMN last_request_at TEXT DEFAULT NULL`);

  // Index for finding sleep-eligible sites
  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_last_request_at ON sites(last_request_at)`);

  // Update status CHECK constraint to include 'sleeping'
  // SQLite doesn't support ALTER CONSTRAINT, so we recreate the table
  // However, SQLite CHECK constraints are not enforced on ALTER TABLE ADD COLUMN,
  // and the original constraint is on the CREATE TABLE. We need to work around this.
  // Since SQLite doesn't support modifying constraints in-place, we rebuild the table.
  db.run(`PRAGMA foreign_keys = OFF`);

  db.run(`
    CREATE TABLE sites_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      git_url TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT 'main',
      type TEXT NOT NULL CHECK (type IN ('auto', 'passthrough')),
      visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
      status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'building', 'error', 'sleeping')),
      container_id TEXT,
      port INTEGER,
      env_vars TEXT NOT NULL DEFAULT '{}',
      persistent_storage INTEGER NOT NULL DEFAULT 0,
      autodeploy INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_deployed_at TEXT,
      sleep_enabled INTEGER NOT NULL DEFAULT 0,
      sleep_after_minutes INTEGER DEFAULT NULL,
      last_request_at TEXT DEFAULT NULL
    )
  `);

  db.run(`
    INSERT INTO sites_new (id, name, git_url, branch, type, visibility, status, container_id, port, env_vars, persistent_storage, autodeploy, created_at, last_deployed_at, sleep_enabled, sleep_after_minutes, last_request_at)
    SELECT id, name, git_url, branch, type, visibility, status, container_id, port, env_vars, persistent_storage, autodeploy, created_at, last_deployed_at, 0, NULL, NULL
    FROM sites
  `);

  db.run(`DROP TABLE sites`);
  db.run(`ALTER TABLE sites_new RENAME TO sites`);

  // Recreate indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_last_request_at ON sites(last_request_at)`);

  db.run(`PRAGMA foreign_keys = ON`);

  // Insert server-level default settings
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('sleep_enabled_default', '0')`);
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('sleep_after_minutes_default', '30')`);
}

export function down(db: Database): void {
  db.run(`PRAGMA foreign_keys = OFF`);

  db.run(`
    CREATE TABLE sites_old (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      git_url TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT 'main',
      type TEXT NOT NULL CHECK (type IN ('auto', 'passthrough')),
      visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
      status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'building', 'error')),
      container_id TEXT,
      port INTEGER,
      env_vars TEXT NOT NULL DEFAULT '{}',
      persistent_storage INTEGER NOT NULL DEFAULT 0,
      autodeploy INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_deployed_at TEXT
    )
  `);

  db.run(`
    INSERT INTO sites_old (id, name, git_url, branch, type, visibility, status, container_id, port, env_vars, persistent_storage, autodeploy, created_at, last_deployed_at)
    SELECT id, name, git_url, branch, type, visibility, CASE WHEN status = 'sleeping' THEN 'stopped' ELSE status END, container_id, port, env_vars, persistent_storage, autodeploy, created_at, last_deployed_at
    FROM sites
  `);

  db.run(`DROP TABLE sites`);
  db.run(`ALTER TABLE sites_old RENAME TO sites`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name)`);

  db.run(`PRAGMA foreign_keys = ON`);

  db.run(`DELETE FROM settings WHERE key IN ('sleep_enabled_default', 'sleep_after_minutes_default')`);
}
