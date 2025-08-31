import { Database } from "../database";
import { hashPassword } from "../../auth/password";
import { validateEmail, validateUsername } from "../../auth/utils";
import { debug, error } from "../../utils/logging";

export interface UserData {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  max_sites: number;
  max_memory_mb: number;
  max_cpu_cores: number;
  max_storage_mb: number;
  is_active: boolean;
  last_login?: string;
  can_create_sites: boolean;
}

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  is_admin?: boolean;
  max_sites?: number;
  max_memory_mb?: number;
  max_cpu_cores?: number;
  max_storage_mb?: number;
  can_create_sites?: boolean;
}

export interface UpdateUserData {
  email?: string;
  max_sites?: number;
  max_memory_mb?: number;
  max_cpu_cores?: number;
  max_storage_mb?: number;
  is_active?: boolean;
  can_create_sites?: boolean;
}

/**
 * User Model for managing users in the database
 */
export class UserModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Create a new user
   */
  async createUser(userData: CreateUserData): Promise<number> {
    // Validate input
    const usernameValidation = validateUsername(userData.username);
    if (!usernameValidation.valid) {
      throw new Error(`Invalid username: ${usernameValidation.errors.join(', ')}`);
    }

    if (!validateEmail(userData.email)) {
      throw new Error('Invalid email format');
    }

    // Check if username or email already exists
    const existing = this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM users WHERE username = ? OR email = ?`,
      [userData.username, userData.email]
    );

    if (existing[0].count > 0) {
      throw new Error('Username or email already exists');
    }

    // Hash password
    const passwordHash = await hashPassword(userData.password);

    // Get default limits from settings
    const defaultLimits = this.getDefaultLimits();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO users (
          username, email, password_hash, is_admin,
          max_sites, max_memory_mb, max_cpu_cores, max_storage_mb, can_create_sites
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        userData.username,
        userData.email,
        passwordHash,
        userData.is_admin ? 1 : 0,
        userData.max_sites ?? defaultLimits.max_sites,
        userData.max_memory_mb ?? defaultLimits.max_memory_mb,
        userData.max_cpu_cores ?? defaultLimits.max_cpu_cores,
        userData.max_storage_mb ?? defaultLimits.max_storage_mb,
        userData.can_create_sites ?? true
      );

      const userId = Number(result.lastInsertRowid);
      debug(`Created user ${userData.username} with ID ${userId}`);
      return userId;
    } catch (err) {
      error(`Failed to create user: ${err}`);
      throw err;
    }
  }

  /**
   * Get user by ID
   */
  getUserById(id: number): UserData | null {
    const result = this.db.query<UserData>(
      `SELECT * FROM users WHERE id = ?`,
      [id]
    );
    return result[0] || null;
  }

  /**
   * Get user by username
   */
  getUserByUsername(username: string): UserData | null {
    const result = this.db.query<UserData>(
      `SELECT * FROM users WHERE username = ?`,
      [username]
    );
    return result[0] || null;
  }

  /**
   * Get user by email
   */
  getUserByEmail(email: string): UserData | null {
    const result = this.db.query<UserData>(
      `SELECT * FROM users WHERE email = ?`,
      [email]
    );
    return result[0] || null;
  }

  /**
   * Update user data
   */
  updateUser(id: number, updates: UpdateUserData): void {
    const validFields = [
      'email', 'max_sites', 'max_memory_mb', 'max_cpu_cores', 
      'max_storage_mb', 'is_active', 'can_create_sites'
    ];
    
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (validFields.includes(key) && value !== undefined) {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    }

    if (updateFields.length === 0) {
      return; // Nothing to update
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(id);

    try {
      const stmt = this.db.prepare(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`
      );
      stmt.run(...updateValues);
      debug(`Updated user ${id}`);
    } catch (err) {
      error(`Failed to update user: ${err}`);
      throw err;
    }
  }

  /**
   * Update user password
   */
  async updatePassword(id: number, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    
    try {
      const stmt = this.db.prepare(
        `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      );
      stmt.run(passwordHash, id);
      debug(`Updated password for user ${id}`);
    } catch (err) {
      error(`Failed to update password: ${err}`);
      throw err;
    }
  }

  /**
   * Delete user (and all their sites)
   */
  deleteUser(id: number): void {
    try {
      // Note: Sites will be deleted automatically due to foreign key constraint
      const stmt = this.db.prepare(`DELETE FROM users WHERE id = ?`);
      stmt.run(id);
      debug(`Deleted user ${id}`);
    } catch (err) {
      error(`Failed to delete user: ${err}`);
      throw err;
    }
  }

  /**
   * Get all users with pagination
   */
  getAllUsers(offset: number = 0, limit: number = 50): UserData[] {
    return this.db.query<UserData>(
      `SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }

  /**
   * Get user count
   */
  getUserCount(): number {
    const result = this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM users`
    );
    return result[0].count;
  }

  /**
   * Get user statistics
   */
  getUserStats(userId: number): {
    site_count: number;
    total_memory_usage: number;
    total_cpu_usage: number;
    total_storage_usage: number;
  } {
    const result = this.db.query<{
      site_count: number;
      total_memory_usage: number;
      total_cpu_usage: number;
      total_storage_usage: number;
    }>(
      `SELECT 
         COUNT(*) as site_count,
         COALESCE(SUM(current_memory_mb), 0) as total_memory_usage,
         COALESCE(SUM(current_cpu_usage), 0) as total_cpu_usage,
         COALESCE(SUM(current_storage_mb), 0) as total_storage_usage
       FROM sites WHERE user_id = ?`,
      [userId]
    );
    
    return result[0] || { site_count: 0, total_memory_usage: 0, total_cpu_usage: 0, total_storage_usage: 0 };
  }

  /**
   * Check if user can create more sites
   */
  canCreateSite(userId: number): boolean {
    const user = this.getUserById(userId);
    if (!user || !user.is_active || !user.can_create_sites) {
      return false;
    }

    const stats = this.getUserStats(userId);
    return stats.site_count < user.max_sites;
  }

  /**
   * Get default limits from system settings
   */
  private getDefaultLimits(): {
    max_sites: number;
    max_memory_mb: number;
    max_cpu_cores: number;
    max_storage_mb: number;
  } {
    const settings = this.db.query<{ key: string; value: string }>(
      `SELECT key, value FROM system_settings WHERE key IN (?, ?, ?, ?)`,
      ['default_max_sites', 'default_max_memory', 'default_max_cpu', 'default_max_storage']
    );

    const defaults = {
      max_sites: 3,
      max_memory_mb: 512,
      max_cpu_cores: 0.5,
      max_storage_mb: 1024
    };

    for (const setting of settings) {
      switch (setting.key) {
        case 'default_max_sites':
          defaults.max_sites = parseInt(setting.value) || 3;
          break;
        case 'default_max_memory':
          defaults.max_memory_mb = parseInt(setting.value) || 512;
          break;
        case 'default_max_cpu':
          defaults.max_cpu_cores = parseFloat(setting.value) || 0.5;
          break;
        case 'default_max_storage':
          defaults.max_storage_mb = parseInt(setting.value) || 1024;
          break;
      }
    }

    return defaults;
  }

  /**
   * Migrate existing sites to a user (for initial admin setup)
   */
  migrateExistingSitesToUser(userId: number): number {
    try {
      // Get existing processes from the old table
      const processes = this.db.query<any>(
        `SELECT * FROM processes WHERE id NOT IN (SELECT path FROM sites)`
      );

      let migratedCount = 0;

      for (const process of processes) {
        try {
          this.db.run(`
            INSERT OR IGNORE INTO sites (
              user_id, name, domain, path, status, created_at, last_deployed
            ) VALUES (?, ?, ?, ?, ?, datetime(?/1000, 'unixepoch'), datetime(?/1000, 'unixepoch'))
          `, [
            userId,
            process.site || process.id,
            process.site || process.id,
            process.cwd || `sites/${process.site}`,
            process.status === 'running' ? 'running' : 'stopped',
            process.startTime || Date.now(),
            process.startTime || Date.now()
          ]);
          migratedCount++;
        } catch (siteErr) {
          debug(`Failed to migrate site ${process.site}: ${siteErr}`);
        }
      }

      debug(`Migrated ${migratedCount} existing sites to user ${userId}`);
      return migratedCount;
    } catch (err) {
      error(`Failed to migrate existing sites: ${err}`);
      return 0;
    }
  }
}

