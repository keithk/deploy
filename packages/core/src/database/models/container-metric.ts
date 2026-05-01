// ABOUTME: Model for ContainerMetric CRUD operations against the container_metrics table.
// ABOUTME: Provides insert, query-by-site-with-since, and retention pruning.

import { randomUUID } from "crypto";
import { Database } from "../database";
import type { ContainerMetric } from "../schema";

export interface InsertContainerMetricData {
  site_id: string;
  recorded_at: string;
  cpu_pct: number;
  mem_bytes: number;
  mem_limit_bytes: number;
  net_rx_bytes: number;
  net_tx_bytes: number;
}

export class ContainerMetricModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Insert a new metric sample row.
   */
  public insert(data: InsertContainerMetricData): void {
    this.db
      .prepare(
        `INSERT INTO container_metrics
         (id, site_id, recorded_at, cpu_pct, mem_bytes, mem_limit_bytes, net_rx_bytes, net_tx_bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        data.site_id,
        data.recorded_at,
        data.cpu_pct,
        data.mem_bytes,
        data.mem_limit_bytes,
        data.net_rx_bytes,
        data.net_tx_bytes
      );
  }

  /**
   * Return samples for a site recorded on or after `since` (ISO-8601), oldest first.
   * Hard-capped at `limit` rows to keep response sizes sane.
   */
  public findBySite(
    siteId: string,
    since: string,
    limit: number = 4032
  ): ContainerMetric[] {
    return this.db.query<ContainerMetric>(
      `SELECT * FROM container_metrics
       WHERE site_id = ? AND recorded_at >= ?
       ORDER BY recorded_at ASC
       LIMIT ?`,
      [siteId, since, limit]
    );
  }

  /**
   * Delete all rows recorded before `beforeIso`. Called every poller tick for retention.
   */
  public pruneOld(beforeIso: string): void {
    this.db
      .prepare(`DELETE FROM container_metrics WHERE recorded_at < ?`)
      .run(beforeIso);
  }
}

export const containerMetricModel = new ContainerMetricModel();
