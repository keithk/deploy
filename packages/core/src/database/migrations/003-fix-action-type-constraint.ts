// ABOUTME: Migration to fix actions table type constraint to include 'custom'
// ABOUTME: SQLite requires table recreation to modify CHECK constraints

import type { Database } from "../database";

export const name = "003-fix-action-type-constraint";

export function up(db: Database): void {
  // Create new table with correct constraint
  db.run(`
    CREATE TABLE IF NOT EXISTS actions_new (
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

  // Copy existing data
  db.run(`
    INSERT OR IGNORE INTO actions_new
    SELECT * FROM actions
  `);

  // Drop old table
  db.run(`DROP TABLE IF EXISTS actions`);

  // Rename new table
  db.run(`ALTER TABLE actions_new RENAME TO actions`);
}

export function down(db: Database): void {
  // No rollback needed - the new constraint is more permissive
}
