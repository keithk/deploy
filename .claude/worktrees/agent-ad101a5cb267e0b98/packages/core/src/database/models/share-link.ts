// ABOUTME: Model for ShareLink CRUD operations against the share_links table.
// ABOUTME: Manages temporary access tokens for private site sharing with expiration handling.

import { randomUUID, randomBytes } from "crypto";
import { Database } from "../database";
import type { ShareLink } from "../schema";

/**
 * ShareLink model for managing temporary site access tokens
 */
export class ShareLinkModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Create a new share link for a site
   */
  public create(siteId: string, expiresInHours: number = 24): ShareLink {
    const id = randomUUID();
    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);

    const shareLink: ShareLink = {
      id,
      site_id: siteId,
      token,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO share_links (id, site_id, token, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      shareLink.id,
      shareLink.site_id,
      shareLink.token,
      shareLink.created_at,
      shareLink.expires_at
    );

    return shareLink;
  }

  /**
   * Find a share link by token (only if not expired)
   */
  public findByToken(token: string): ShareLink | null {
    const now = new Date().toISOString();
    const results = this.db.query<ShareLink>(
      `SELECT * FROM share_links WHERE token = ? AND expires_at > ? LIMIT 1`,
      [token, now]
    );
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Find all share links for a site
   */
  public findBySiteId(siteId: string): ShareLink[] {
    return this.db.query<ShareLink>(
      `SELECT * FROM share_links WHERE site_id = ?`,
      [siteId]
    );
  }

  /**
   * Delete a share link by ID
   */
  public delete(id: string): boolean {
    const results = this.db.query<ShareLink>(
      `SELECT * FROM share_links WHERE id = ? LIMIT 1`,
      [id]
    );
    if (results.length === 0) {
      return false;
    }

    const stmt = this.db.prepare(`DELETE FROM share_links WHERE id = ?`);
    stmt.run(id);
    return true;
  }

  /**
   * Delete all expired share links
   */
  public deleteExpired(): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      `DELETE FROM share_links WHERE expires_at <= ?`
    );
    stmt.run(now);
  }
}

// Export a singleton instance
export const shareLinkModel = new ShareLinkModel();
