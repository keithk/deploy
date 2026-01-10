// ABOUTME: Initial migration creating the simplified schema for sites, actions, share links, logs, sessions, and settings.
// ABOUTME: Includes proper indexes for performance on frequently queried columns.

import type { Database } from "../database";

/**
 * Migration name for tracking purposes
 */
export const name = "001-simplified-schema";

/**
 * Apply the migration - creates all tables and indexes
 */
export function up(db: Database): void {
  // Sites table
  db.run(`
    CREATE TABLE IF NOT EXISTS sites (
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_deployed_at TEXT
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name)`);

  // Actions table
  db.run(`
    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('scheduled', 'webhook', 'hook', 'custom')),
      site_id TEXT,
      schedule TEXT,
      hook_event TEXT,
      code TEXT,
      git_url TEXT,
      entry_path TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      last_run_status TEXT,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL
    )
  `);

  // Share links table
  db.run(`
    CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token)`);

  // Logs table
  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      site_id TEXT,
      action_id TEXT,
      type TEXT NOT NULL CHECK (type IN ('build', 'runtime', 'action')),
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
      FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`);

  // Sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`);

  // Settings table
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

/**
 * Rollback the migration - drops all tables
 */
export function down(db: Database): void {
  // Drop tables in reverse order to respect foreign key constraints
  db.run(`DROP TABLE IF EXISTS settings`);
  db.run(`DROP TABLE IF EXISTS sessions`);
  db.run(`DROP TABLE IF EXISTS logs`);
  db.run(`DROP TABLE IF EXISTS share_links`);
  db.run(`DROP TABLE IF EXISTS actions`);
  db.run(`DROP TABLE IF EXISTS sites`);
}
