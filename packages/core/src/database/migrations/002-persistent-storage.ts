// ABOUTME: Migration adding persistent_storage column to sites table.
// ABOUTME: Enables per-site opt-in for volume-mounted persistent data.

import type { Database } from "../database";

export const name = "002-persistent-storage";

export function up(db: Database): void {
  db.run(`
    ALTER TABLE sites ADD COLUMN persistent_storage INTEGER NOT NULL DEFAULT 0
  `);
}

export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN directly, would need table recreation
  // For simplicity, this is a no-op - the column will remain but be unused
}
