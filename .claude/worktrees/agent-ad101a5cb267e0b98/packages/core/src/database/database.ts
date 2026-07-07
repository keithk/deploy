// ABOUTME: Core database class providing SQLite connection management and query execution.
// ABOUTME: Implements singleton pattern for consistent database access across the application.

import { Database as SQLiteDatabase, type Statement, type SQLQueryBindings } from "bun:sqlite";
import { join } from "path";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { debug, error, info, warn } from "../utils/logging";

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
  public run(sql: string, params: SQLQueryBindings[] = []): void {
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
  public prepare(sql: string): Statement {
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
  public query<T = Record<string, unknown>>(sql: string, params: SQLQueryBindings[] = []): T[] {
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

  /**
   * Run all pending migrations from the migrations folder
   */
  public async runMigrations(): Promise<void> {
    // Create migrations tracking table if it doesn't exist
    this.run(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Get list of already applied migrations
    const applied = this.query<{ name: string }>(`SELECT name FROM _migrations`);
    const appliedNames = new Set(applied.map(m => m.name));

    // Find migration files
    const migrationsDir = join(import.meta.dir, "migrations");
    if (!existsSync(migrationsDir)) {
      debug("No migrations directory found");
      return;
    }

    const files = readdirSync(migrationsDir)
      .filter(f => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts") && !f.endsWith(".map") && !f.includes(".test."))
      .sort();

    for (const file of files) {
      const migrationName = file.replace(/\.(ts|js)$/, "");

      if (appliedNames.has(migrationName)) {
        debug(`Migration ${migrationName} already applied`);
        continue;
      }

      try {
        info(`Running migration: ${migrationName}`);
        const migration = await import(join(migrationsDir, file));

        if (typeof migration.up !== "function") {
          throw new Error(`Migration ${migrationName} does not export an 'up' function`);
        }

        migration.up(this);

        // Record the migration as applied
        this.run(`INSERT INTO _migrations (name) VALUES (?)`, [migrationName]);
        info(`Migration ${migrationName} applied successfully`);
      } catch (err) {
        error(`Failed to run migration ${migrationName}: ${err}`);
        throw err;
      }
    }
  }
}
