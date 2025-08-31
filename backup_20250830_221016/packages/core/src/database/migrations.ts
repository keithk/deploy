import { Database } from "./database";
import { debug, error, info } from "../utils/logging";

export interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

/**
 * Database migrations for the community platform
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: "create_users_table",
    up: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- Resource limits (set by admin)
        max_sites INTEGER DEFAULT 3,
        max_memory_mb INTEGER DEFAULT 512,
        max_cpu_cores REAL DEFAULT 0.5,
        max_storage_mb INTEGER DEFAULT 1024,
        
        -- Status
        is_active BOOLEAN DEFAULT 1,
        last_login DATETIME,
        
        -- Registration settings
        can_create_sites BOOLEAN DEFAULT 1
      );
      
      CREATE INDEX idx_users_username ON users(username);
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_active ON users(is_active);
    `,
    down: `DROP TABLE users;`
  },
  {
    version: 2,
    name: "create_user_sessions_table",
    up: `
      CREATE TABLE user_sessions (
        id VARCHAR(128) PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      
      CREATE INDEX idx_sessions_user ON user_sessions(user_id);
      CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);
    `,
    down: `DROP TABLE user_sessions;`
  },
  {
    version: 3,
    name: "create_sites_table",
    up: `
      CREATE TABLE sites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name VARCHAR(100) NOT NULL,
        domain VARCHAR(255) NOT NULL,
        template VARCHAR(50) DEFAULT 'static',
        
        -- File system
        path VARCHAR(500) NOT NULL,
        
        -- Status
        status VARCHAR(20) DEFAULT 'stopped',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_deployed DATETIME,
        last_edited DATETIME,
        
        -- Resource usage tracking
        current_memory_mb INTEGER DEFAULT 0,
        current_cpu_usage REAL DEFAULT 0,
        current_storage_mb INTEGER DEFAULT 0,
        
        -- Build/deploy info
        build_command TEXT,
        start_command TEXT,
        environment_vars TEXT,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(name, user_id),
        UNIQUE(domain)
      );
      
      CREATE INDEX idx_sites_user ON sites(user_id);
      CREATE INDEX idx_sites_domain ON sites(domain);
      CREATE INDEX idx_sites_status ON sites(status);
    `,
    down: `DROP TABLE sites;`
  },
  {
    version: 4,
    name: "create_system_settings_table", 
    up: `
      CREATE TABLE system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER,
        
        FOREIGN KEY (updated_by) REFERENCES users(id)
      );
      
      -- Default settings
      INSERT INTO system_settings (key, value, description) VALUES 
      ('registration_enabled', 'true', 'Allow new user registration'),
      ('admin_domain', 'admin', 'Subdomain for admin panel'),
      ('editor_domain', 'editor', 'Subdomain for code editor'),
      ('default_max_sites', '3', 'Default max sites for new users'),
      ('default_max_memory', '512', 'Default memory limit in MB'),
      ('default_max_cpu', '0.5', 'Default CPU limit in cores'),
      ('default_max_storage', '1024', 'Default storage limit in MB');
    `,
    down: `DROP TABLE system_settings;`
  },
  {
    version: 5,
    name: "create_site_templates_table",
    up: `
      CREATE TABLE site_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        description TEXT,
        
        -- Template files (JSON array)
        files TEXT NOT NULL,
        
        -- Resource recommendations
        recommended_memory INTEGER DEFAULT 256,
        recommended_cpu REAL DEFAULT 0.2,
        
        -- Commands
        install_command TEXT,
        build_command TEXT,
        start_command TEXT,
        
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Default templates
      INSERT INTO site_templates (name, display_name, description, files, install_command, build_command, start_command) VALUES
      ('static', 'Static HTML', 'Simple HTML/CSS/JS site', '["index.html", "style.css", "script.js"]', null, null, null),
      ('node', 'Node.js App', 'Basic Node.js application', '["package.json", "server.js"]', 'npm install', null, 'npm start'),
      ('astro', 'Astro Site', 'Modern static site with Astro', '["package.json", "astro.config.mjs", "src/pages/index.astro"]', 'npm install', 'npm run build', 'npm run preview');
    `,
    down: `DROP TABLE site_templates;`
  },
  {
    version: 6,
    name: "create_site_repositories_table",
    up: `
      CREATE TABLE site_repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_name VARCHAR(100) NOT NULL,
        site_id INTEGER,
        git_initialized BOOLEAN DEFAULT FALSE,
        main_branch VARCHAR(100) DEFAULT 'main',
        
        -- Git repository metadata
        total_commits INTEGER DEFAULT 0,
        last_commit_hash VARCHAR(40),
        last_commit_message TEXT,
        last_commit_date DATETIME,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        UNIQUE(site_name)
      );
      
      CREATE INDEX idx_site_repos_name ON site_repositories(site_name);
      CREATE INDEX idx_site_repos_site_id ON site_repositories(site_id);
    `,
    down: `DROP TABLE site_repositories;`
  },
  {
    version: 7,
    name: "create_editing_sessions_table",
    up: `
      CREATE TABLE editing_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        site_name VARCHAR(100) NOT NULL,
        branch_name VARCHAR(200) NOT NULL,
        container_name VARCHAR(200),
        
        -- Session status
        status VARCHAR(20) DEFAULT 'active', -- active, inactive, deploying, failed
        mode VARCHAR(20) DEFAULT 'edit', -- edit, preview
        
        -- Preview container info
        preview_port INTEGER,
        preview_url VARCHAR(500),
        
        -- Activity tracking
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_save DATETIME,
        last_commit DATETIME,
        
        -- Git info
        base_commit_hash VARCHAR(40),
        current_commit_hash VARCHAR(40),
        commits_count INTEGER DEFAULT 0,
        
        -- Auto-cleanup
        expires_at DATETIME,
        auto_cleanup BOOLEAN DEFAULT TRUE,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(site_name, branch_name)
      );
      
      CREATE INDEX idx_editing_sessions_user ON editing_sessions(user_id);
      CREATE INDEX idx_editing_sessions_site ON editing_sessions(site_name);
      CREATE INDEX idx_editing_sessions_status ON editing_sessions(status);
      CREATE INDEX idx_editing_sessions_activity ON editing_sessions(last_activity);
      CREATE INDEX idx_editing_sessions_expires ON editing_sessions(expires_at);
    `,
    down: `DROP TABLE editing_sessions;`
  },
  {
    version: 8,
    name: "create_branch_commits_table",
    up: `
      CREATE TABLE branch_commits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        site_name VARCHAR(100) NOT NULL,
        branch_name VARCHAR(200) NOT NULL,
        
        -- Commit info
        commit_hash VARCHAR(40) NOT NULL,
        commit_message TEXT NOT NULL,
        commit_author VARCHAR(255) NOT NULL,
        
        -- File changes
        files_changed INTEGER DEFAULT 0,
        files_added INTEGER DEFAULT 0,
        files_deleted INTEGER DEFAULT 0,
        files_modified TEXT, -- JSON array of changed files
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (session_id) REFERENCES editing_sessions(id) ON DELETE CASCADE
      );
      
      CREATE INDEX idx_branch_commits_session ON branch_commits(session_id);
      CREATE INDEX idx_branch_commits_site ON branch_commits(site_name);
      CREATE INDEX idx_branch_commits_hash ON branch_commits(commit_hash);
    `,
    down: `DROP TABLE branch_commits;`
  }
];

/**
 * Migration manager for database schema updates
 */
export class MigrationManager {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
    this.initializeMigrationsTable();
  }

  /**
   * Create the migrations tracking table
   */
  private initializeMigrationsTable(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Get the current schema version
   */
  private getCurrentVersion(): number {
    const result = this.db.query<{ version: number }>(
      `SELECT MAX(version) as version FROM schema_migrations`
    );
    return result[0]?.version || 0;
  }

  /**
   * Check if a migration has been executed
   */
  private isMigrationExecuted(version: number): boolean {
    const result = this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM schema_migrations WHERE version = ?`,
      [version]
    );
    return result[0].count > 0;
  }

  /**
   * Execute a single migration
   */
  private executeMigration(migration: Migration): void {
    try {
      info(`Running migration ${migration.version}: ${migration.name}`);
      
      // Execute the migration SQL
      this.db.run(migration.up);
      
      // Record the migration as executed
      this.db.run(
        `INSERT INTO schema_migrations (version, name) VALUES (?, ?)`,
        [migration.version, migration.name]
      );
      
      info(`Migration ${migration.version} completed successfully`);
    } catch (err) {
      error(`Migration ${migration.version} failed: ${err}`);
      throw err;
    }
  }

  /**
   * Run all pending migrations
   */
  public runMigrations(): void {
    const currentVersion = this.getCurrentVersion();
    info(`Current database version: ${currentVersion}`);
    
    const pendingMigrations = migrations.filter(
      migration => migration.version > currentVersion
    );
    
    if (pendingMigrations.length === 0) {
      info("No pending migrations");
      return;
    }
    
    info(`Running ${pendingMigrations.length} pending migrations`);
    
    for (const migration of pendingMigrations) {
      if (!this.isMigrationExecuted(migration.version)) {
        this.executeMigration(migration);
      }
    }
    
    info("All migrations completed successfully");
  }

  /**
   * Get migration status
   */
  public getStatus(): { current: number; available: number; pending: number } {
    const current = this.getCurrentVersion();
    const available = Math.max(...migrations.map(m => m.version));
    const pending = available - current;
    
    return { current, available, pending };
  }

  /**
   * Reset database by running down migrations (dangerous!)
   */
  public reset(): void {
    const executedMigrations = this.db.query<{ version: number; name: string }>(
      `SELECT version, name FROM schema_migrations ORDER BY version DESC`
    );
    
    for (const executed of executedMigrations) {
      const migration = migrations.find(m => m.version === executed.version);
      if (migration?.down) {
        try {
          info(`Rolling back migration ${migration.version}: ${migration.name}`);
          this.db.run(migration.down);
          this.db.run(
            `DELETE FROM schema_migrations WHERE version = ?`,
            [migration.version]
          );
        } catch (err) {
          error(`Failed to rollback migration ${migration.version}: ${err}`);
          throw err;
        }
      }
    }
    
    info("Database reset completed");
  }
}

// Export a singleton instance
export const migrationManager = new MigrationManager();