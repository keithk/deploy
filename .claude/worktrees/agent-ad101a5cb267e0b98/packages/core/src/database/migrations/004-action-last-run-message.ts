// ABOUTME: Migration adding last_run_message column to actions table.
// ABOUTME: Stores the result message from the most recent action execution.

import type { Database } from "../database";

export const name = "004-action-last-run-message";

export function up(db: Database): void {
  db.run(`
    ALTER TABLE actions ADD COLUMN last_run_message TEXT
  `);
}

export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN directly, would need table recreation
  // For simplicity, this is a no-op - the column will remain but be unused
}
