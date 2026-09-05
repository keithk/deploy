// ABOUTME: Adds per-site Postgres database columns for the attach-database feature.
// ABOUTME: database_name is the provisioned database/role; database_url is the encrypted connection string.

import type { Database } from "../database";

export const name = "015-site-databases";

export function up(db: Database): void {
  db.run(`ALTER TABLE sites ADD COLUMN database_name TEXT`);
  db.run(`ALTER TABLE sites ADD COLUMN database_url TEXT`);
}

export function down(db: Database): void {
  db.run(`ALTER TABLE sites DROP COLUMN database_url`);
  db.run(`ALTER TABLE sites DROP COLUMN database_name`);
}
