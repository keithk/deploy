// ABOUTME: Model for Settings CRUD operations against the settings table.
// ABOUTME: Manages key-value settings like GitHub token.

import { Database } from "../database";

interface Setting {
  key: string;
  value: string;
}

/**
 * Settings model for managing server configuration
 */
export class SettingsModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Get a setting by key
   */
  public get(key: string): string | null {
    const results = this.db.query<Setting>(
      `SELECT * FROM settings WHERE key = ? LIMIT 1`,
      [key]
    );
    return results.length > 0 ? results[0].value : null;
  }

  /**
   * Set a setting (upsert)
   */
  public set(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }

  /**
   * Delete a setting
   */
  public delete(key: string): boolean {
    const existing = this.get(key);
    if (!existing) {
      return false;
    }
    const stmt = this.db.prepare(`DELETE FROM settings WHERE key = ?`);
    stmt.run(key);
    return true;
  }

  /**
   * Get all settings
   */
  public getAll(): Record<string, string> {
    const results = this.db.query<Setting>(`SELECT * FROM settings`);
    const settings: Record<string, string> = {};
    for (const row of results) {
      settings[row.key] = row.value;
    }
    return settings;
  }
}

// Export a singleton instance
export const settingsModel = new SettingsModel();
