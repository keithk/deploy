// ABOUTME: Migration adding 'compose' as a site type (docker-compose-backed sites).
// ABOUTME: Makes git_url nullable, adds compose_yaml/primary_service/primary_port columns.

import type { Database } from "../database";

export const name = "010-compose-sites";

export function up(db: Database): void {
  db.run(`PRAGMA foreign_keys = OFF`);

  db.run(`
    CREATE TABLE sites_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      git_url TEXT,
      branch TEXT NOT NULL DEFAULT 'main',
      type TEXT NOT NULL CHECK (type IN ('auto', 'passthrough', 'compose')),
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
      last_request_at TEXT DEFAULT NULL,
      compose_yaml TEXT,
      primary_service TEXT,
      primary_port INTEGER
    )
  `);

  db.run(`
    INSERT INTO sites_new (id, name, git_url, branch, type, visibility, status, container_id, port, env_vars, persistent_storage, autodeploy, created_at, last_deployed_at, sleep_enabled, sleep_after_minutes, last_request_at, compose_yaml, primary_service, primary_port)
    SELECT id, name, git_url, branch, type, visibility, status, container_id, port, env_vars, persistent_storage, autodeploy, created_at, last_deployed_at, sleep_enabled, sleep_after_minutes, last_request_at, NULL, NULL, NULL
    FROM sites
  `);

  db.run(`DROP TABLE sites`);
  db.run(`ALTER TABLE sites_new RENAME TO sites`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_last_request_at ON sites(last_request_at)`);

  db.run(`PRAGMA foreign_keys = ON`);
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
    INSERT INTO sites_old (id, name, git_url, branch, type, visibility, status, container_id, port, env_vars, persistent_storage, autodeploy, created_at, last_deployed_at, sleep_enabled, sleep_after_minutes, last_request_at)
    SELECT id, name, COALESCE(git_url, ''), branch, CASE WHEN type = 'compose' THEN 'auto' ELSE type END, visibility, status, container_id, port, env_vars, persistent_storage, autodeploy, created_at, last_deployed_at, sleep_enabled, sleep_after_minutes, last_request_at
    FROM sites
    WHERE type != 'compose'
  `);

  db.run(`DROP TABLE sites`);
  db.run(`ALTER TABLE sites_old RENAME TO sites`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_last_request_at ON sites(last_request_at)`);

  db.run(`PRAGMA foreign_keys = ON`);
}
