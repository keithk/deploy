// ABOUTME: Migration adding deployment_steps table for per-step timing of deploys.
// ABOUTME: Backs the deploy waterfall view in the admin dashboard.

import type { Database } from "../database";

export const name = "008-deployment-steps";

export function up(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS deployment_steps (
      id TEXT PRIMARY KEY,
      deployment_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error_message TEXT,
      FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_deployment_steps_deployment_id
    ON deployment_steps(deployment_id)
  `);
}

export function down(db: Database): void {
  db.run(`DROP TABLE IF EXISTS deployment_steps`);
}
