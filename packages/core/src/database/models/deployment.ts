// ABOUTME: Model for Deployment CRUD operations against the deployments table.
// ABOUTME: Provides tracking for in-progress and historical deployments.

import { randomUUID } from "crypto";
import { Database } from "../database";
import type { Deployment } from "../schema";

/**
 * Data required to create a new deployment
 */
export interface CreateDeploymentData {
  site_id: string;
  old_container_id?: string | null;
  old_port?: number | null;
  commit_sha?: string | null;
  commit_message?: string | null;
}

/**
 * Data for updating a deployment
 */
export interface UpdateDeploymentData {
  status?: Deployment["status"];
  completed_at?: string;
  new_container_id?: string | null;
  new_port?: number | null;
  error_message?: string | null;
}

/**
 * Deployment model for managing deployment records in the database
 */
export class DeploymentModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Create a new deployment record
   */
  public create(data: CreateDeploymentData): Deployment {
    const id = randomUUID();
    const now = new Date().toISOString();

    const deployment: Deployment = {
      id,
      site_id: data.site_id,
      status: "pending",
      started_at: now,
      completed_at: null,
      old_container_id: data.old_container_id ?? null,
      old_port: data.old_port ?? null,
      new_container_id: null,
      new_port: null,
      commit_sha: data.commit_sha ?? null,
      commit_message: data.commit_message ?? null,
      error_message: null,
    };

    const stmt = this.db.prepare(`
      INSERT INTO deployments (id, site_id, status, started_at, completed_at, old_container_id, old_port, new_container_id, new_port, commit_sha, commit_message, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      deployment.id,
      deployment.site_id,
      deployment.status,
      deployment.started_at,
      deployment.completed_at,
      deployment.old_container_id,
      deployment.old_port,
      deployment.new_container_id,
      deployment.new_port,
      deployment.commit_sha,
      deployment.commit_message,
      deployment.error_message
    );

    return deployment;
  }

  /**
   * Find a deployment by ID
   */
  public findById(id: string): Deployment | null {
    const results = this.db.query<Deployment>(
      `SELECT * FROM deployments WHERE id = ? LIMIT 1`,
      [id]
    );
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Find all deployments for a site, ordered by started_at descending
   */
  public findBySiteId(siteId: string, limit: number = 20): Deployment[] {
    return this.db.query<Deployment>(
      `SELECT * FROM deployments WHERE site_id = ? ORDER BY started_at DESC LIMIT ?`,
      [siteId, limit]
    );
  }

  /**
   * Find all active (in-progress) deployments
   */
  public findActive(): Deployment[] {
    return this.db.query<Deployment>(
      `SELECT * FROM deployments WHERE status NOT IN ('completed', 'failed', 'rolled_back') ORDER BY started_at DESC`
    );
  }

  /**
   * Find all deployments, ordered by started_at descending
   */
  public findAll(limit: number = 50): Deployment[] {
    return this.db.query<Deployment>(
      `SELECT * FROM deployments ORDER BY started_at DESC LIMIT ?`,
      [limit]
    );
  }

  /**
   * Update a deployment
   */
  public update(id: string, data: UpdateDeploymentData): Deployment | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.status !== undefined) {
      updates.push("status = ?");
      values.push(data.status);
    }
    if (data.completed_at !== undefined) {
      updates.push("completed_at = ?");
      values.push(data.completed_at);
    }
    if (data.new_container_id !== undefined) {
      updates.push("new_container_id = ?");
      values.push(data.new_container_id);
    }
    if (data.new_port !== undefined) {
      updates.push("new_port = ?");
      values.push(data.new_port);
    }
    if (data.error_message !== undefined) {
      updates.push("error_message = ?");
      values.push(data.error_message);
    }

    if (updates.length === 0) {
      return existing;
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE deployments SET ${updates.join(", ")} WHERE id = ?`
    );
    stmt.run(...values);

    return this.findById(id);
  }

  /**
   * Update deployment status
   */
  public updateStatus(id: string, status: Deployment["status"]): void {
    const stmt = this.db.prepare(`UPDATE deployments SET status = ? WHERE id = ?`);
    stmt.run(status, id);
  }

  /**
   * Mark a deployment as completed
   */
  public complete(
    id: string,
    newContainerId: string,
    newPort: number
  ): Deployment | null {
    return this.update(id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      new_container_id: newContainerId,
      new_port: newPort,
    });
  }

  /**
   * Mark a deployment as failed
   */
  public fail(id: string, errorMessage: string): Deployment | null {
    return this.update(id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    });
  }

  /**
   * Delete old deployments for a site (keep last N)
   */
  public pruneOld(siteId: string, keepCount: number = 50): number {
    const keepIds = this.db.query<{ id: string }>(
      `SELECT id FROM deployments WHERE site_id = ? ORDER BY started_at DESC LIMIT ?`,
      [siteId, keepCount]
    );

    if (keepIds.length === 0) {
      return 0;
    }

    const keepIdSet = keepIds.map((d) => `'${d.id}'`).join(",");
    const result = this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM deployments WHERE site_id = ? AND id NOT IN (${keepIdSet})`,
      [siteId]
    );

    const stmt = this.db.prepare(
      `DELETE FROM deployments WHERE site_id = ? AND id NOT IN (${keepIdSet})`
    );
    stmt.run(siteId);

    return result[0]?.count ?? 0;
  }
}

// Export a singleton instance
export const deploymentModel = new DeploymentModel();
