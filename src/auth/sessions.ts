import { Database } from "../database/database";
import { generateSessionToken } from "./utils";
import { debug, error } from "../utils/logging";
import { UserData } from "../database/models/user";

export interface SessionData {
  id: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
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
export async function validateSession(sessionId: string): Promise<UserData | null> {
  if (!sessionId) return null;
  
  const db = Database.getInstance();
  
  try {
    const result = db.query<SessionData & UserData>(
      `SELECT 
         s.id as session_id,
         s.user_id,
         s.created_at as session_created_at,
         s.expires_at,
         s.ip_address,
         s.user_agent,
         u.*
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
    if (!sessionUser) {
      debug(`Session ${sessionId} not found`);
      return null;
    }
    
    // Return the full UserData, converting any boolean fields from SQLite integers
    return {
      id: sessionUser.id,
      username: sessionUser.username,
      email: sessionUser.email,
      password_hash: sessionUser.password_hash,
      is_admin: Boolean(sessionUser.is_admin),
      is_active: Boolean(sessionUser.is_active),
      created_at: sessionUser.created_at,
      updated_at: sessionUser.updated_at,
      max_sites: sessionUser.max_sites,
      max_memory_mb: sessionUser.max_memory_mb,
      max_cpu_cores: sessionUser.max_cpu_cores,
      max_storage_mb: sessionUser.max_storage_mb,
      can_create_sites: Boolean(sessionUser.can_create_sites),
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