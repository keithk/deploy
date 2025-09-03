import { Database } from "../database";

/**
 * Interface for process information
 */
export interface ProcessInfo {
  site: string;
  port: number;
  pid?: number;
  type: string;
  script: string;
  cwd: string;
  env?: Record<string, string>;
  startTime: Date;
  status: string;
}

/**
 * Interface for process registry entry
 */
export interface ProcessRegistryEntry {
  id: string;
  site: string;
  port: number;
  pid?: number;
  startTime: number;
  type: string;
  script: string;
  cwd: string;
  status: string;
}

// Bun's bundler strips interface-only exports, causing runtime errors.
// These placeholder exports ensure the types remain accessible after bundling.
export const ProcessInfo = {} as ProcessInfo;
export const ProcessRegistryEntry = {} as ProcessRegistryEntry;

/**
 * Process Model for managing process records in the database
 */
export class ProcessModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
    this.up();
  }

  /**
   * Create the processes table if it doesn't exist
   */
  public up(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS processes (
        id TEXT PRIMARY KEY,
        site TEXT NOT NULL,
        port INTEGER NOT NULL,
        pid INTEGER,
        startTime INTEGER NOT NULL,
        type TEXT NOT NULL,
        script TEXT NOT NULL,
        cwd TEXT NOT NULL,
        status TEXT NOT NULL
      )
    `);

    // Create an index on the status column for faster queries
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_processes_status ON processes(status)
    `);
  }

  /**
   * Save process information to the database
   */
  public save(id: string, info: ProcessInfo): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO processes (id, site, port, pid, startTime, type, script, cwd, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      info.site,
      info.port,
      info.pid || null,
      info.startTime.getTime(),
      info.type,
      info.script,
      info.cwd,
      info.status
    );
  }

  /**
   * Update process status in the database
   */
  public updateStatus(id: string, status: string): void {
    const stmt = this.db.prepare(`
      UPDATE processes SET status = ? WHERE id = ?
    `);

    stmt.run(status, id);
  }

  /**
   * Delete process from the database
   */
  public delete(id: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM processes WHERE id = ?
    `);

    stmt.run(id);
  }

  /**
   * Load all processes from the database
   */
  public getAll(): ProcessRegistryEntry[] {
    return this.db.query<ProcessRegistryEntry>(`
      SELECT id, site, port, pid, startTime, type, script, cwd, status
      FROM processes
    `);
  }

  /**
   * Get processes by status
   */
  public getByStatus(status: string): ProcessRegistryEntry[] {
    return this.db.query<ProcessRegistryEntry>(
      `SELECT * FROM processes WHERE status = ?`,
      [status]
    );
  }

  /**
   * Get a process by ID
   */
  public getById(id: string): ProcessRegistryEntry | undefined {
    const results = this.db.query<ProcessRegistryEntry>(
      `SELECT * FROM processes WHERE id = ? LIMIT 1`,
      [id]
    );
    return results.length > 0 ? results[0] : undefined;
  }
}

// Export a singleton instance
export const processModel = new ProcessModel();
