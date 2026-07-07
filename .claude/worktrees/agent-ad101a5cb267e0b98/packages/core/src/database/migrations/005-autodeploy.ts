// ABOUTME: Migration adding autodeploy column to sites table.
// ABOUTME: Enables per-site automatic deployment when GitHub webhooks fire.

import type { Database } from "../database";

export const name = "005-autodeploy";

export function up(db: Database): void {
  db.run(`
    ALTER TABLE sites ADD COLUMN autodeploy INTEGER NOT NULL DEFAULT 0
  `);
}

export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN directly, would need table recreation
  // For simplicity, this is a no-op - the column will remain but be unused
}
