import { Database } from "../database/database";
import { generateSessionToken } from "./utils";
import { debug, error } from "../utils/logging";

export interface SessionData {
  id: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  last_login?: string;
}

/**
 * Create a new user session
 */
export async function createSession(
  userId: number,
  ipAddress?: string,
  userAgent?: string,
  durationHours: number = 24
): Promise<string> {
  const db = Database.getInstance();
  const sessionId = generateSessionToken();
  
  // Calculate expiration time
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + durationHours);
  
  try {
    db.run(
      `INSERT INTO user_sessions (id, user_id, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [
        sessionId,
        userId,
        expiresAt.toISOString(),
        ipAddress || null,
        userAgent || null
      ]
    );
    
    // Update user's last login time
    db.run(
      `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`,
      [userId]
    );
    
    debug(`Created session ${sessionId} for user ${userId}`);
    return sessionId;
  } catch (err) {
    error(`Failed to create session: ${err}`);
    throw err;
  }
}

/**
 * Validate a session token and return user data
 */
export async function validateSession(sessionId: string): Promise<User | null> {
  if (!sessionId) return null;
  
  const db = Database.getInstance();
  
  try {
    const result = db.query<SessionData & User>(
      `SELECT 
         s.id as session_id,
         s.user_id,
         s.created_at,
         s.expires_at,
         s.ip_address,
         s.user_agent,
         u.id,
         u.username,
         u.email,
         u.is_admin,
         u.is_active,
         u.last_login
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1`,
      [sessionId]
    );
    
    if (result.length === 0) {
      debug(`Session ${sessionId} not found or expired`);
      return null;
    }
    
    const sessionUser = result[0];
    return {
      id: sessionUser.id,
      username: sessionUser.username,
      email: sessionUser.email,
      is_admin: Boolean(sessionUser.is_admin),
      is_active: Boolean(sessionUser.is_active),
      last_login: sessionUser.last_login
    };
  } catch (err) {
    error(`Failed to validate session: ${err}`);
    return null;
  }
}

/**
 * Destroy a session (logout)
 */
export async function destroySession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  
  const db = Database.getInstance();
  
  try {
    db.run(`DELETE FROM user_sessions WHERE id = ?`, [sessionId]);
    debug(`Destroyed session ${sessionId}`);
  } catch (err) {
    error(`Failed to destroy session: ${err}`);
    throw err;
  }
}

/**
 * Destroy all sessions for a user (useful for password changes, etc.)
 */
export async function destroyAllUserSessions(userId: number): Promise<void> {
  const db = Database.getInstance();
  
  try {
    db.run(`DELETE FROM user_sessions WHERE user_id = ?`, [userId]);
    debug(`Destroyed all sessions for user ${userId}`);
  } catch (err) {
    error(`Failed to destroy user sessions: ${err}`);
    throw err;
  }
}

/**
 * Clean up expired sessions (should be run periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const db = Database.getInstance();
  
  try {
    const result = db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM user_sessions WHERE expires_at <= datetime('now')`
    );
    const expiredCount = result[0]?.count || 0;
    
    if (expiredCount > 0) {
      db.run(`DELETE FROM user_sessions WHERE expires_at <= datetime('now')`);
      debug(`Cleaned up ${expiredCount} expired sessions`);
    }
    
    return expiredCount;
  } catch (err) {
    error(`Failed to cleanup expired sessions: ${err}`);
    return 0;
  }
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: number): Promise<SessionData[]> {
  const db = Database.getInstance();
  
  try {
    return db.query<SessionData>(
      `SELECT id, user_id, created_at, expires_at, ip_address, user_agent
       FROM user_sessions
       WHERE user_id = ? AND expires_at > datetime('now')
       ORDER BY created_at DESC`,
      [userId]
    );
  } catch (err) {
    error(`Failed to get user sessions: ${err}`);
    return [];
  }
}

/**
 * Extend a session's expiration time
 */
export async function extendSession(sessionId: string, additionalHours: number = 24): Promise<boolean> {
  const db = Database.getInstance();
  
  try {
    const newExpiration = new Date();
    newExpiration.setHours(newExpiration.getHours() + additionalHours);
    
    const result = db.prepare(`UPDATE user_sessions SET expires_at = ? WHERE id = ?`)
      .run(newExpiration.toISOString(), sessionId);
    
    if (result.changes > 0) {
      debug(`Extended session ${sessionId} by ${additionalHours} hours`);
      return true;
    }
    
    return false;
  } catch (err) {
    error(`Failed to extend session: ${err}`);
    return false;
  }
}