// ABOUTME: Model for Log CRUD operations against the logs table.
// ABOUTME: Provides create and query operations for deployment and runtime logs.

import { randomUUID } from "crypto";
import { Database } from "../database";
import type { Log } from "../schema";

/**
 * Data required to create a new log entry
 */
export interface CreateLogData {
  site_id?: string;
  action_id?: string;
  type: "build" | "runtime" | "action";
  content: string;
}

/**
 * Log model for managing log records in the database
 */
export class LogModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Create a new log entry
   */
  public create(data: CreateLogData): Log {
    const id = randomUUID();
    const now = new Date().toISOString();

    const log: Log = {
      id,
      site_id: data.site_id ?? null,
      action_id: data.action_id ?? null,
      type: data.type,
      content: data.content,
      timestamp: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO logs (id, site_id, action_id, type, content, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(log.id, log.site_id, log.action_id, log.type, log.content, log.timestamp);

    return log;
  }

  /**
   * Append content to site logs (creates a new entry)
   */
  public append(siteId: string, type: "build" | "runtime", content: string): Log {
    return this.create({
      site_id: siteId,
      type,
      content,
    });
  }

  /**
   * Find logs for a site, ordered by timestamp descending
   */
  public findBySiteId(siteId: string, limit: number = 100): Log[] {
    return this.db.query<Log>(
      `SELECT * FROM logs WHERE site_id = ? ORDER BY timestamp DESC LIMIT ?`,
      [siteId, limit]
    );
  }

  /**
   * Find logs for an action, ordered by timestamp descending
   */
  public findByActionId(actionId: string, limit: number = 100): Log[] {
    return this.db.query<Log>(
      `SELECT * FROM logs WHERE action_id = ? ORDER BY timestamp DESC LIMIT ?`,
      [actionId, limit]
    );
  }

  /**
   * Find recent logs of a specific type for a site
   */
  public findBySiteIdAndType(
    siteId: string,
    type: "build" | "runtime" | "action",
    limit: number = 50
  ): Log[] {
    return this.db.query<Log>(
      `SELECT * FROM logs WHERE site_id = ? AND type = ? ORDER BY timestamp DESC LIMIT ?`,
      [siteId, type, limit]
    );
  }

  /**
   * Delete old logs for a site (keep last N entries)
   */
  public pruneOldLogs(siteId: string, keepCount: number = 1000): number {
    // Get IDs of logs to keep
    const keepIds = this.db.query<{ id: string }>(
      `SELECT id FROM logs WHERE site_id = ? ORDER BY timestamp DESC LIMIT ?`,
      [siteId, keepCount]
    );

    if (keepIds.length === 0) {
      return 0;
    }

    const keepIdSet = keepIds.map((l) => `'${l.id}'`).join(",");
    const result = this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM logs WHERE site_id = ? AND id NOT IN (${keepIdSet})`,
      [siteId]
    );

    const stmt = this.db.prepare(
      `DELETE FROM logs WHERE site_id = ? AND id NOT IN (${keepIdSet})`
    );
    stmt.run(siteId);

    return result[0]?.count ?? 0;
  }

  /**
   * Clear all logs for a site
   */
  public clearBySiteId(siteId: string): void {
    const stmt = this.db.prepare(`DELETE FROM logs WHERE site_id = ?`);
    stmt.run(siteId);
  }
}

// Export a singleton instance
export const logModel = new LogModel();
