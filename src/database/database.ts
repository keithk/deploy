import { Database as SQLiteDatabase } from "bun:sqlite";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { debug, error, warn } from "../utils/logging";
import { DEPLOY_PATHS, LEGACY_PATHS, ensureDeployDir } from "../config/paths";

/**
 * Base Database class for managing SQLite connections
 */
export class Database {
  private static instance: Database;
  private db!: SQLiteDatabase;
  private dataDir: string;

  private constructor(options: { dataDir?: string } = {}) {
    // Set up data directory - use new .deploy/database structure
    this.dataDir = options.dataDir || DEPLOY_PATHS.databaseDir;
    
    // Ensure the new directory structure exists
    this.ensureDataDirectory();

    this.connect();
  }

  /**
   * Ensure the data directory exists and handle migration from old location
   */
  private ensureDataDirectory(): void {
    try {
      // Create the new directory structure
      if (!existsSync(this.dataDir)) {
        mkdirSync(this.dataDir, { recursive: true });
      }
      
      // Check for legacy database and migrate if needed
      if (existsSync(LEGACY_PATHS.oldDatabase) && !existsSync(DEPLOY_PATHS.database)) {
        debug("Migrating database from legacy location...");
        try {
          // Use synchronous rename for simplicity in constructor
          const fs = require('fs');
          fs.renameSync(LEGACY_PATHS.oldDatabase, DEPLOY_PATHS.database);
          debug("Database migration completed successfully");
        } catch (err) {
          warn(`Database migration failed: ${err}. Will create new database.`);
        }
      }
    } catch (err) {
      error(`Failed to set up database directory: ${err}`);
    }
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
      // Use the centralized path configuration
      const dbPath = DEPLOY_PATHS.database;
      this.db = new SQLiteDatabase(dbPath);
      debug(`Connected to database at: ${dbPath}`);
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
   * Returns an object with lastInsertRowid and changes
   */
  public run(sql: string, params: any[] = []): { lastInsertRowid: number | bigint; changes: number } {
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...(params || []));
      return result;
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
      return stmt.all(...(params || [])) as T[];
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

/**
 * Helper function to get database instance (for backward compatibility)
 */
export function getDB(): Database {
  return Database.getInstance();
}
