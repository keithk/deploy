// ABOUTME: Adds named deploy groups and their many-to-many site memberships.
// ABOUTME: Enables a reusable set of sites to be redeployed together.

import type { Database } from "../database";

export const name = "014-deploy-groups";

export function up(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS deploy_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS deploy_group_sites (
      group_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      PRIMARY KEY (group_id, site_id),
      FOREIGN KEY (group_id) REFERENCES deploy_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_deploy_group_sites_site_id ON deploy_group_sites(site_id)`);
}

export function down(db: Database): void {
  db.run(`DROP TABLE IF EXISTS deploy_group_sites`);
  db.run(`DROP TABLE IF EXISTS deploy_groups`);
}
