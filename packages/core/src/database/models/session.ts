// ABOUTME: Model for Session CRUD operations against the sessions table.
// ABOUTME: Manages dashboard authentication sessions with expiration handling.

import { randomUUID, randomBytes } from "crypto";
import { Database } from "../database";
import type { Session } from "../schema";

/**
 * Session model for managing dashboard authentication sessions
 */
export class SessionModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Create a new session
   */
  public create(expiresInDays: number = 7): Session {
    const id = randomUUID();
    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

    const session: Session = {
      id,
      token,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, token, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.token,
      session.created_at,
      session.expires_at
    );

    return session;
  }

  /**
   * Find a session by token (only if not expired)
   */
  public findByToken(token: string): Session | null {
    const now = new Date().toISOString();
    const results = this.db.query<Session>(
      `SELECT * FROM sessions WHERE token = ? AND expires_at > ? LIMIT 1`,
      [token, now]
    );
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Delete a session by token
   */
  public delete(token: string): boolean {
    const results = this.db.query<Session>(
      `SELECT * FROM sessions WHERE token = ? LIMIT 1`,
      [token]
    );
    if (results.length === 0) {
      return false;
    }

    const stmt = this.db.prepare(`DELETE FROM sessions WHERE token = ?`);
    stmt.run(token);
    return true;
  }

  /**
   * Delete all expired sessions
   */
  public deleteExpired(): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      `DELETE FROM sessions WHERE expires_at <= ?`
    );
    stmt.run(now);
  }
}

// Export a singleton instance
export const sessionModel = new SessionModel();
