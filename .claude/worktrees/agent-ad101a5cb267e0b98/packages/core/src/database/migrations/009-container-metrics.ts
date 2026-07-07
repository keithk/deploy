// ABOUTME: Migration adding container_metrics table for per-container time-series data.
// ABOUTME: Backs the live metrics charts in the site detail admin dashboard.

import type { Database } from "../database";

export const name = "009-container-metrics";

export function up(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS container_metrics (
      id          TEXT    PRIMARY KEY,
      site_id     TEXT    NOT NULL,
      recorded_at TEXT    NOT NULL,
      cpu_pct     REAL    NOT NULL,
      mem_bytes   INTEGER NOT NULL,
      mem_limit_bytes INTEGER NOT NULL,
      net_rx_bytes INTEGER NOT NULL,
      net_tx_bytes INTEGER NOT NULL,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_container_metrics_site_recorded
      ON container_metrics (site_id, recorded_at DESC)
  `);
}

export function down(db: Database): void {
  db.run(`DROP TABLE IF EXISTS container_metrics`);
}
