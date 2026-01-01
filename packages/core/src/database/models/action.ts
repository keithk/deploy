// ABOUTME: Model for Action CRUD operations against the actions table.
// ABOUTME: Manages actions discovered from deployed sites.

import { Database } from "../database";
import type { DbAction } from "../schema";

export interface CreateActionData {
  id: string;
  name: string;
  type: string;
  site_id?: string;
  schedule?: string;
  hook_event?: string;
  entry_path?: string;
  enabled?: boolean;
}

/**
 * Action model for managing actions from deployed sites
 */
export class ActionModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Create or update an action (upsert)
   */
  public upsert(data: CreateActionData): DbAction {
    const stmt = this.db.prepare(`
      INSERT INTO actions (id, name, type, site_id, schedule, hook_event, entry_path, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        site_id = excluded.site_id,
        schedule = excluded.schedule,
        hook_event = excluded.hook_event,
        entry_path = excluded.entry_path,
        enabled = excluded.enabled
    `);
    stmt.run(
      data.id,
      data.name,
      data.type,
      data.site_id || null,
      data.schedule || null,
      data.hook_event || null,
      data.entry_path || null,
      data.enabled !== false ? 1 : 0
    );
    return this.findById(data.id)!;
  }

  /**
   * Find an action by ID
   */
  public findById(id: string): DbAction | null {
    const results = this.db.query<DbAction>(
      `SELECT * FROM actions WHERE id = ? LIMIT 1`,
      [id]
    );
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Find all actions for a site
   */
  public findBySiteId(siteId: string): DbAction[] {
    return this.db.query<DbAction>(
      `SELECT * FROM actions WHERE site_id = ? ORDER BY name`,
      [siteId]
    );
  }

  /**
   * Find all actions
   */
  public findAll(): DbAction[] {
    return this.db.query<DbAction>(`SELECT * FROM actions ORDER BY name`);
  }

  /**
   * Delete all actions for a site
   */
  public deleteBySiteId(siteId: string): number {
    const stmt = this.db.prepare(`DELETE FROM actions WHERE site_id = ?`);
    const result = stmt.run(siteId);
    return result.changes;
  }

  /**
   * Delete an action by ID
   */
  public delete(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM actions WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Update last run info
   */
  public updateLastRun(id: string, status: string, message?: string): void {
    const stmt = this.db.prepare(`
      UPDATE actions SET last_run_at = datetime('now'), last_run_status = ?, last_run_message = ?
      WHERE id = ?
    `);
    stmt.run(status, message || null, id);
  }
}

// Export a singleton instance
export const actionModel = new ActionModel();
