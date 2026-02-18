// ABOUTME: Model for Site CRUD operations against the sites table.
// ABOUTME: Provides create, read, update, delete, and status management for deployed sites.

import { randomUUID } from "crypto";
import { Database } from "../database";
import type { Site } from "../schema";

/**
 * Data required to create a new site
 */
export interface CreateSiteData {
  name: string;
  git_url: string;
  type: "auto" | "passthrough";
  branch?: string;
  visibility?: "public" | "private";
  env_vars?: string;
  persistent_storage?: boolean;
  autodeploy?: boolean;
}

/**
 * Data for updating an existing site
 */
export interface UpdateSiteData {
  name?: string;
  git_url?: string;
  type?: "auto" | "passthrough";
  branch?: string;
  visibility?: "public" | "private";
  env_vars?: string;
  persistent_storage?: boolean;
  autodeploy?: boolean;
}

/**
 * Site model for managing site records in the database
 */
export class SiteModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Create a new site
   */
  public create(data: CreateSiteData): Site {
    const id = randomUUID();
    const now = new Date().toISOString();

    const site: Site = {
      id,
      name: data.name,
      git_url: data.git_url,
      branch: data.branch ?? "main",
      type: data.type,
      visibility: data.visibility ?? "private",
      status: "stopped",
      container_id: null,
      port: null,
      env_vars: data.env_vars ?? "{}",
      persistent_storage: data.persistent_storage ? 1 : 0,
      autodeploy: data.autodeploy ? 1 : 0,
      created_at: now,
      last_deployed_at: null,
    };

    const stmt = this.db.prepare(`
      INSERT INTO sites (id, name, git_url, branch, type, visibility, status, container_id, port, env_vars, persistent_storage, autodeploy, created_at, last_deployed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      site.id,
      site.name,
      site.git_url,
      site.branch,
      site.type,
      site.visibility,
      site.status,
      site.container_id,
      site.port,
      site.env_vars,
      site.persistent_storage,
      site.autodeploy,
      site.created_at,
      site.last_deployed_at
    );

    return site;
  }

  /**
   * Find a site by ID
   */
  public findById(id: string): Site | null {
    const results = this.db.query<Site>(
      `SELECT * FROM sites WHERE id = ? LIMIT 1`,
      [id]
    );
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Find a site by name
   */
  public findByName(name: string): Site | null {
    const results = this.db.query<Site>(
      `SELECT * FROM sites WHERE name = ? LIMIT 1`,
      [name]
    );
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Find all sites
   */
  public findAll(): Site[] {
    return this.db.query<Site>(`SELECT * FROM sites`);
  }

  /**
   * Normalize a git URL to canonical form for comparison
   * Converts various formats to: github.com/owner/repo
   */
  private normalizeGitUrl(url: string): string {
    let normalized = url.toLowerCase().trim();

    // Remove protocol
    normalized = normalized.replace(/^https?:\/\//, "");
    normalized = normalized.replace(/^git@/, "");

    // Convert SSH format (git@github.com:owner/repo) to path format
    normalized = normalized.replace(":", "/");

    // Remove .git suffix
    normalized = normalized.replace(/\.git$/, "");

    // Remove trailing slash
    normalized = normalized.replace(/\/$/, "");

    return normalized;
  }

  /**
   * Find a site by git URL (with normalization for matching)
   */
  public findByGitUrl(gitUrl: string): Site | null {
    const normalizedSearch = this.normalizeGitUrl(gitUrl);
    const allSites = this.findAll();

    for (const site of allSites) {
      if (this.normalizeGitUrl(site.git_url) === normalizedSearch) {
        return site;
      }
    }

    return null;
  }

  /**
   * Update a site by ID
   */
  public update(id: string, data: UpdateSiteData): Site | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.name !== undefined) {
      updates.push("name = ?");
      values.push(data.name);
    }
    if (data.git_url !== undefined) {
      updates.push("git_url = ?");
      values.push(data.git_url);
    }
    if (data.type !== undefined) {
      updates.push("type = ?");
      values.push(data.type);
    }
    if (data.branch !== undefined) {
      updates.push("branch = ?");
      values.push(data.branch);
    }
    if (data.visibility !== undefined) {
      updates.push("visibility = ?");
      values.push(data.visibility);
    }
    if (data.env_vars !== undefined) {
      updates.push("env_vars = ?");
      values.push(data.env_vars);
    }
    if (data.persistent_storage !== undefined) {
      updates.push("persistent_storage = ?");
      values.push(data.persistent_storage ? 1 : 0);
    }
    if (data.autodeploy !== undefined) {
      updates.push("autodeploy = ?");
      values.push(data.autodeploy ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE sites SET ${updates.join(", ")} WHERE id = ?`
    );
    stmt.run(...values);

    return this.findById(id);
  }

  /**
   * Delete a site by ID
   */
  public delete(id: string): boolean {
    const existing = this.findById(id);
    if (!existing) {
      return false;
    }

    const stmt = this.db.prepare(`DELETE FROM sites WHERE id = ?`);
    stmt.run(id);
    return true;
  }

  /**
   * Update site status and optionally container_id and port.
   * If containerId and port are not provided, they are preserved (not cleared).
   */
  public updateStatus(
    id: string,
    status: Site["status"],
    containerId?: string,
    port?: number
  ): void {
    // If container info is provided, update everything
    if (containerId !== undefined || port !== undefined) {
      const stmt = this.db.prepare(`
        UPDATE sites SET status = ?, container_id = ?, port = ? WHERE id = ?
      `);
      stmt.run(status, containerId ?? null, port ?? null, id);
    } else {
      // Only update status, preserve existing container_id and port
      const stmt = this.db.prepare(`
        UPDATE sites SET status = ? WHERE id = ?
      `);
      stmt.run(status, id);
    }
  }

  /**
   * Mark a site as deployed with current timestamp
   */
  public markDeployed(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE sites SET last_deployed_at = datetime('now') WHERE id = ?
    `);
    stmt.run(id);
  }
}

// Export a singleton instance
export const siteModel = new SiteModel();
