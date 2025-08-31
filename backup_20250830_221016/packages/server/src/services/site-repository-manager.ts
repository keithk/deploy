import { gitService } from './git-service';
import { Database } from '@keithk/deploy-core/src/database/database';
import { join } from 'path';
import { existsSync } from 'fs';
import { debug, info, warn, error } from '../utils/logging';

export interface SiteRepository {
  id: number;
  siteName: string;
  siteId?: number;
  gitInitialized: boolean;
  mainBranch: string;
  totalCommits: number;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  lastCommitDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Site Repository Manager
 * Manages Git repositories for sites and tracks their metadata
 */
export class SiteRepositoryManager {
  private static instance: SiteRepositoryManager;
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  static getInstance(): SiteRepositoryManager {
    if (!SiteRepositoryManager.instance) {
      SiteRepositoryManager.instance = new SiteRepositoryManager();
    }
    return SiteRepositoryManager.instance;
  }

  /**
   * Initializes Git repositories for all sites in a given root directory
   */
  async initializeAllSiteRepositories(rootDir: string): Promise<void> {
    info(`Initializing Git repositories for sites in: ${rootDir}`);
    
    if (!existsSync(rootDir)) {
      warn(`Root directory does not exist: ${rootDir}`);
      return;
    }

    // Get all site directories (exclude admin and editor built-ins)
    const { readdirSync, statSync } = await import('fs');
    
    try {
      const entries = readdirSync(rootDir, { withFileTypes: true });
      const siteDirs = entries
        .filter(entry => entry.isDirectory())
        .filter(entry => !['admin', 'editor', '.git', '.deploy'].includes(entry.name))
        .map(entry => ({
          name: entry.name,
          path: join(rootDir, entry.name)
        }));

      info(`Found ${siteDirs.length} site directories to initialize`);

      for (const site of siteDirs) {
        try {
          await this.initializeSiteRepository(site.name, site.path);
        } catch (err) {
          error(`Failed to initialize repository for site ${site.name}: ${err}`);
        }
      }

      info(`Completed Git repository initialization for all sites`);
    } catch (err) {
      error(`Failed to read root directory ${rootDir}: ${err}`);
    }
  }

  /**
   * Initializes a Git repository for a specific site
   */
  async initializeSiteRepository(siteName: string, sitePath: string): Promise<SiteRepository> {
    info(`Initializing Git repository for site: ${siteName} at ${sitePath}`);

    // Check if repository record already exists
    const existing = await this.getSiteRepository(siteName);
    if (existing && existing.gitInitialized) {
      debug(`Repository already initialized for site: ${siteName}`);
      return existing;
    }

    // Initialize Git repository
    await gitService.initializeRepository(sitePath);

    // Get initial commit info
    const status = await gitService.getStatus(sitePath);
    const history = await gitService.getCommitHistory(sitePath, 1);
    const firstCommit = history[0];

    // Create or update repository record
    const repoData = {
      siteName,
      gitInitialized: true,
      mainBranch: status.currentBranch || 'main',
      totalCommits: 1,
      lastCommitHash: firstCommit?.hash,
      lastCommitMessage: firstCommit?.message,
      lastCommitDate: firstCommit?.date?.toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (existing) {
      // Update existing record
      this.db.run(`
        UPDATE site_repositories 
        SET git_initialized = ?, main_branch = ?, total_commits = ?,
            last_commit_hash = ?, last_commit_message = ?, last_commit_date = ?,
            updated_at = ?
        WHERE site_name = ?
      `, [
        repoData.gitInitialized, repoData.mainBranch, repoData.totalCommits,
        repoData.lastCommitHash, repoData.lastCommitMessage, repoData.lastCommitDate,
        repoData.updatedAt, siteName
      ]);
      
      info(`Updated repository record for site: ${siteName}`);
      const updatedRepo = await this.getSiteRepository(siteName);
      if (!updatedRepo) {
        throw new Error(`Failed to retrieve updated repository for site: ${siteName}`);
      }
      return updatedRepo;
    } else {
      // Create new record using prepared statement
      const stmt = this.db.prepare(`
        INSERT INTO site_repositories (
          site_name, git_initialized, main_branch, total_commits,
          last_commit_hash, last_commit_message, last_commit_date,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const result = stmt.run(
        siteName, repoData.gitInitialized, repoData.mainBranch, repoData.totalCommits,
        repoData.lastCommitHash, repoData.lastCommitMessage, repoData.lastCommitDate,
        repoData.updatedAt, repoData.updatedAt
      );

      const repoId = Number(result.lastInsertRowid);

      info(`Created repository record for site: ${siteName} (ID: ${repoId})`);
      const newRepo = await this.getSiteRepository(siteName);
      if (!newRepo) {
        throw new Error(`Failed to retrieve created repository for site: ${siteName}`);
      }
      return newRepo;
    }
  }

  /**
   * Gets a site repository by name
   */
  async getSiteRepository(siteName: string): Promise<SiteRepository | null> {
    const results = this.db.query<any>(`
      SELECT * FROM site_repositories WHERE site_name = ?
    `, [siteName]);

    if (results.length === 0) {
      return null;
    }

    return this.mapDbRowToRepository(results[0]);
  }

  /**
   * Lists all site repositories
   */
  async getAllSiteRepositories(): Promise<SiteRepository[]> {
    const results = this.db.query<any>(`
      SELECT * FROM site_repositories ORDER BY created_at DESC
    `);

    return results.map(row => this.mapDbRowToRepository(row));
  }

  /**
   * Updates repository metadata after Git operations
   */
  async updateRepositoryMetadata(siteName: string, sitePath: string): Promise<void> {
    try {
      const status = await gitService.getStatus(sitePath);
      const history = await gitService.getCommitHistory(sitePath, 1);
      const latestCommit = history[0];

      if (!latestCommit) {
        return;
      }

      // Count total commits
      const allHistory = await gitService.getCommitHistory(sitePath, 1000);
      const totalCommits = allHistory.length;

      this.db.run(`
        UPDATE site_repositories 
        SET total_commits = ?, last_commit_hash = ?, last_commit_message = ?,
            last_commit_date = ?, updated_at = ?
        WHERE site_name = ?
      `, [
        totalCommits, latestCommit.hash, latestCommit.message,
        latestCommit.date.toISOString(), new Date().toISOString(),
        siteName
      ]);

      debug(`Updated repository metadata for site: ${siteName}`);
    } catch (err) {
      warn(`Failed to update repository metadata for ${siteName}: ${err}`);
    }
  }

  /**
   * Checks if a site has a Git repository initialized
   */
  async isSiteGitInitialized(siteName: string): Promise<boolean> {
    const repo = await this.getSiteRepository(siteName);
    return repo?.gitInitialized || false;
  }

  /**
   * Gets repository statistics for admin dashboard
   */
  async getRepositoryStats(): Promise<{
    totalRepositories: number;
    initializedRepositories: number;
    totalCommits: number;
    recentActivity: Array<{ siteName: string; lastCommit: Date; message: string }>;
  }> {
    const all = await this.getAllSiteRepositories();
    const initialized = all.filter(repo => repo.gitInitialized);
    const totalCommits = initialized.reduce((sum, repo) => sum + repo.totalCommits, 0);
    
    const recentActivity = initialized
      .filter(repo => repo.lastCommitDate)
      .sort((a, b) => (b.lastCommitDate?.getTime() || 0) - (a.lastCommitDate?.getTime() || 0))
      .slice(0, 10)
      .map(repo => ({
        siteName: repo.siteName,
        lastCommit: repo.lastCommitDate!,
        message: repo.lastCommitMessage || 'No message'
      }));

    return {
      totalRepositories: all.length,
      initializedRepositories: initialized.length,
      totalCommits,
      recentActivity
    };
  }

  /**
   * Updates the .gitignore in the root directory to exclude sites folder
   */
  async ensureRootGitignore(rootDir: string): Promise<void> {
    const { readFileSync, writeFileSync } = await import('fs');
    const gitignorePath = join(rootDir, '..', '.gitignore');
    
    try {
      let gitignoreContent = '';
      
      if (existsSync(gitignorePath)) {
        gitignoreContent = readFileSync(gitignorePath, 'utf8');
      }

      // Check if sites folder is already ignored
      const sitesIgnorePattern = '\nsites/\n';
      if (!gitignoreContent.includes('sites/')) {
        gitignoreContent += `\n# Site repositories (each site has its own Git repo)\nsites/\n`;
        writeFileSync(gitignorePath, gitignoreContent, 'utf8');
        info(`Updated root .gitignore to exclude sites folder`);
      } else {
        debug('Root .gitignore already excludes sites folder');
      }
    } catch (err) {
      warn(`Failed to update root .gitignore: ${err}`);
    }
  }

  /**
   * Maps database row to SiteRepository object
   */
  private mapDbRowToRepository(row: any): SiteRepository {
    return {
      id: row.id,
      siteName: row.site_name,
      siteId: row.site_id,
      gitInitialized: Boolean(row.git_initialized),
      mainBranch: row.main_branch,
      totalCommits: row.total_commits,
      lastCommitHash: row.last_commit_hash,
      lastCommitMessage: row.last_commit_message,
      lastCommitDate: row.last_commit_date ? new Date(row.last_commit_date) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}

// Export singleton instance
export const siteRepositoryManager = SiteRepositoryManager.getInstance();