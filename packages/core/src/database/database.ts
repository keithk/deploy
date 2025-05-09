import { Database as SQLiteDatabase } from "bun:sqlite";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { debug, error, warn } from "../utils/logging";

/**
 * Base Database class for managing SQLite connections
 */
export class Database {
  private static instance: Database;
  private db!: SQLiteDatabase;
  private dataDir: string;

  private constructor(options: { dataDir?: string } = {}) {
    // Set up data directory
    this.dataDir = options.dataDir || join(process.cwd(), "data");
    if (!existsSync(this.dataDir)) {
      try {
        mkdirSync(this.dataDir, { recursive: true });
      } catch (err) {
        error(`Failed to create data directory: ${err}`);
      }
    }

    this.connect();
  }

  /**
   * Get the singleton instance of the Database
   */
  public static getInstance(options?: { dataDir?: string }): Database {
    if (!Database.instance) {
      Database.instance = new Database(options);
    }
    return Database.instance;
  }

  /**
   * Connect to the SQLite database
   */
  private connect(): void {
    try {
      const dbPath = join(this.dataDir, "dialup-deploy.db");
      this.db = new SQLiteDatabase(dbPath);
    } catch (err) {
      error(`Failed to connect to database: ${err}`);

      // Fallback to in-memory database
      try {
        this.db = new SQLiteDatabase(":memory:");
        warn("Using in-memory database as fallback");
      } catch (fallbackErr) {
        error(`Failed to initialize in-memory database: ${fallbackErr}`);
      }
    }
  }

  /**
   * Get the SQLite database connection
   */
  public getConnection(): SQLiteDatabase {
    return this.db;
  }

  /**
   * Execute a SQL statement
   */
  public run(sql: string, params: any[] = []): void {
    try {
      this.db.run(sql, params);
    } catch (err) {
      error(`Database error executing: ${sql}`);
      error(err);
      throw err;
    }
  }

  /**
   * Prepare a SQL statement
   */
  public prepare(sql: string): any {
    try {
      return this.db.prepare(sql);
    } catch (err) {
      error(`Database error preparing: ${sql}`);
      error(err);
      throw err;
    }
  }

  /**
   * Execute a query and return results
   */
  public query<T = any>(sql: string, params: any[] = []): T[] {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(params) as T[];
    } catch (err) {
      error(`Database error querying: ${sql}`);
      error(err);
      throw err;
    }
  }

  /**
   * Close the database connection
   */
  public close(): void {
    this.db.close();
  }
}
