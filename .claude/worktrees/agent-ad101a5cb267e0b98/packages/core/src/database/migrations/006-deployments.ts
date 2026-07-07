// ABOUTME: Migration adding deployments table for tracking deployment history.
// ABOUTME: Enables visibility into in-progress and historical deployments.

import type { Database } from "../database";

export const name = "006-deployments";

export function up(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      old_container_id TEXT,
      old_port INTEGER,
      new_container_id TEXT,
      new_port INTEGER,
      commit_sha TEXT,
      commit_message TEXT,
      error_message TEXT,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_deployments_site_id ON deployments(site_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status)
  `);
}

export function down(db: Database): void {
  db.run(`DROP TABLE IF EXISTS deployments`);
}
