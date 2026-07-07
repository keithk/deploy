// ABOUTME: Migration converting custom_domain (single string) to custom_domains (JSON array).
// ABOUTME: Enables a site to answer to more than one custom domain.

import type { Database } from "../database";

export const name = "012-custom-domains-array";

export function up(db: Database): void {
  db.run(`ALTER TABLE sites ADD COLUMN custom_domains TEXT NOT NULL DEFAULT '[]'`);

  const rows = db.query<{ id: string; custom_domain: string | null }>(
    `SELECT id, custom_domain FROM sites WHERE custom_domain IS NOT NULL AND custom_domain != ''`
  );

  for (const row of rows) {
    db.run(`UPDATE sites SET custom_domains = ? WHERE id = ?`, [
      JSON.stringify([row.custom_domain]),
      row.id,
    ]);
  }

  // SQLite doesn't support DROP COLUMN directly; recreate without custom_domain.
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
      primary_port INTEGER,
      custom_domains TEXT NOT NULL DEFAULT '[]'
    )
  `);

  db.run(`
    INSERT INTO sites_new (id, name, git_url, branch, type, visibility, status, container_id, port, env_vars, persistent_storage, autodeploy, created_at, last_deployed_at, sleep_enabled, sleep_after_minutes, last_request_at, compose_yaml, primary_service, primary_port, custom_domains)
    SELECT id, name, git_url, branch, type, visibility, status, container_id, port, env_vars, persistent_storage, autodeploy, created_at, last_deployed_at, sleep_enabled, sleep_after_minutes, last_request_at, compose_yaml, primary_service, primary_port, custom_domains
    FROM sites
  `);

  db.run(`DROP TABLE sites`);
  db.run(`ALTER TABLE sites_new RENAME TO sites`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_last_request_at ON sites(last_request_at)`);

  db.run(`PRAGMA foreign_keys = ON`);
}

export function down(db: Database): void {
  db.run(`ALTER TABLE sites ADD COLUMN custom_domain TEXT DEFAULT NULL`);

  const rows = db.query<{ id: string; custom_domains: string }>(
    `SELECT id, custom_domains FROM sites`
  );

  for (const row of rows) {
    try {
      const domains = JSON.parse(row.custom_domains || "[]");
      if (Array.isArray(domains) && domains.length > 0) {
        db.run(`UPDATE sites SET custom_domain = ? WHERE id = ?`, [domains[0], row.id]);
      }
    } catch {
      // Malformed JSON — leave custom_domain null for this row.
    }
  }

  db.run(`PRAGMA foreign_keys = OFF`);

  db.run(`
    CREATE TABLE sites_old (
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
      primary_port INTEGER,
      custom_domain TEXT DEFAULT NULL
    )
  `);

  db.run(`
    INSERT INTO sites_old (id, name, git_url, branch, type, visibility, status, container_id, port, env_vars, persistent_storage, autodeploy, created_at, last_deployed_at, sleep_enabled, sleep_after_minutes, last_request_at, compose_yaml, primary_service, primary_port, custom_domain)
    SELECT id, name, git_url, branch, type, visibility, status, container_id, port, env_vars, persistent_storage, autodeploy, created_at, last_deployed_at, sleep_enabled, sleep_after_minutes, last_request_at, compose_yaml, primary_service, primary_port, custom_domain
    FROM sites
  `);

  db.run(`DROP TABLE sites`);
  db.run(`ALTER TABLE sites_old RENAME TO sites`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_last_request_at ON sites(last_request_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_custom_domain ON sites(custom_domain)`);

  db.run(`PRAGMA foreign_keys = ON`);
}
