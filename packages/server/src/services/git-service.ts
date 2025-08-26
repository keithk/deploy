import { simpleGit, SimpleGit } from 'simple-git';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { debug, info, warn, error } from '../utils/logging';

export interface GitBranch {
  name: string;
  current: boolean;
  commit: string;
  created: Date;
}

export interface GitStatus {
  isRepository: boolean;
  currentBranch: string;
  isDirty: boolean;
  untracked: string[];
  modified: string[];
}

export interface GitCommitInfo {
  hash: string;
  message: string;
  author: string;
  date: Date;
}

/**
 * Local Git Service using simple-git
 * Handles all Git operations for site repositories without external dependencies
 */
export class GitService {
  private static instance: GitService;

  static getInstance(): GitService {
    if (!GitService.instance) {
      GitService.instance = new GitService();
    }
    return GitService.instance;
  }

  /**
   * Checks if a directory is a Git repository
   */
  isGitRepository(sitePath: string): boolean {
    const gitDir = join(sitePath, '.git');
    return existsSync(gitDir);
  }

  /**
   * Gets a simple-git instance for the specified path
   */
  private getGit(sitePath: string): SimpleGit {
    return simpleGit(sitePath, {
      binary: 'git',
      maxConcurrentProcesses: 6,
      config: [
        'user.name=Deploy System',
        'user.email=deploy@dev.deploy',
        'init.defaultBranch=main'
      ]
    });
  }

  /**
   * Initializes a Git repository in the specified directory
   */
  async initializeRepository(sitePath: string): Promise<void> {
    if (this.isGitRepository(sitePath)) {
      debug(`Repository already exists at ${sitePath}`);
      return;
    }

    info(`Initializing Git repository at ${sitePath}`);

    const git = this.getGit(sitePath);
    
    try {
      // Initialize the repository
      await git.init();
      
      // Create default .gitignore
      await this.createDefaultGitignore(sitePath);
      
      // Make initial commit
      await git.add('.');
      await git.commit('Initial commit - Site created');
      
      info(`Git repository initialized at ${sitePath}`);
    } catch (err) {
      error(`Failed to initialize repository at ${sitePath}: ${err}`);
      throw err;
    }
  }

  /**
   * Creates a new editing branch from main
   */
  async createEditBranch(sitePath: string, baseName: string = 'edit'): Promise<string> {
    const timestamp = Date.now();
    const branchName = `${baseName}-${timestamp}`;
    
    debug(`Creating edit branch: ${branchName} at ${sitePath}`);
    
    const git = this.getGit(sitePath);
    
    try {
      // Ensure we're on main branch with latest changes
      await git.checkout('main');
      
      // For local Git, make sure main branch HEAD is current
      // This ensures we create the new branch from the latest main state
      const status = await git.status();
      debug(`Main branch status: ${status.current}, clean: ${status.isClean()}`);
      
      // Create and checkout new branch from current main HEAD
      await git.checkoutLocalBranch(branchName);
      
      info(`Created edit branch: ${branchName}`);
      return branchName;
    } catch (err) {
      error(`Failed to create edit branch ${branchName}: ${err}`);
      throw err;
    }
  }

  /**
   * Lists all branches in the repository
   */
  async listBranches(sitePath: string): Promise<GitBranch[]> {
    if (!this.isGitRepository(sitePath)) {
      return [];
    }

    const git = this.getGit(sitePath);
    
    try {
      const branchSummary = await git.branch(['-v']);
      const branches: GitBranch[] = [];
      
      for (const [name, branch] of Object.entries(branchSummary.branches)) {
        if (name !== 'HEAD') {
          branches.push({
            name,
            current: branch.current,
            commit: branch.commit,
            created: new Date() // simple-git doesn't provide creation date easily
          });
        }
      }
      
      return branches;
    } catch (err) {
      warn(`Failed to list branches for ${sitePath}: ${err}`);
      return [];
    }
  }

  /**
   * Gets the current Git status
   */
  async getStatus(sitePath: string): Promise<GitStatus> {
    if (!this.isGitRepository(sitePath)) {
      return {
        isRepository: false,
        currentBranch: '',
        isDirty: false,
        untracked: [],
        modified: []
      };
    }

    const git = this.getGit(sitePath);
    
    try {
      const status = await git.status();
      
      return {
        isRepository: true,
        currentBranch: status.current || 'unknown',
        isDirty: !status.isClean(),
        untracked: status.not_added,
        modified: [
          ...status.modified, 
          ...status.staged, 
          ...status.deleted, 
          ...status.renamed.map(r => `${r.from} -> ${r.to}`)
        ]
      };
    } catch (err) {
      warn(`Failed to get Git status for ${sitePath}: ${err}`);
      return {
        isRepository: true,
        currentBranch: 'unknown',
        isDirty: false,
        untracked: [],
        modified: []
      };
    }
  }

  /**
   * Commits all changes in the working directory
   */
  async commitChanges(sitePath: string, message?: string): Promise<string> {
    const status = await this.getStatus(sitePath);
    
    if (!status.isDirty) {
      debug(`No changes to commit in ${sitePath}`);
      return '';
    }

    // Generate commit message if none provided
    const commitMessage = message || this.generateCommitMessage(status);
    
    info(`Committing changes in ${sitePath}: ${commitMessage}`);
    
    const git = this.getGit(sitePath);
    
    try {
      // Add all changes
      await git.add('.');
      
      // Commit changes
      const result = await git.commit(commitMessage);
      
      const commitHash = result.commit.substring(0, 7);
      info(`Committed changes: ${commitHash}`);
      
      return commitHash;
    } catch (err) {
      error(`Failed to commit changes in ${sitePath}: ${err}`);
      throw err;
    }
  }

  /**
   * Merges a branch into main and deletes the branch
   */
  async mergeBranchToMain(sitePath: string, branchName: string): Promise<void> {
    info(`Merging branch ${branchName} to main in ${sitePath}`);
    
    const git = this.getGit(sitePath);
    
    try {
      // Switch to main branch
      await git.checkout('main');
      
      // Merge the branch
      await git.merge([branchName]);
      
      // Delete the branch
      await git.deleteLocalBranch(branchName);
      
      info(`Successfully merged and deleted branch ${branchName}`);
    } catch (err) {
      error(`Failed to merge branch ${branchName}: ${err}`);
      throw err;
    }
  }

  /**
   * Switches to a specific branch
   */
  async checkoutBranch(sitePath: string, branchName: string): Promise<void> {
    debug(`Switching to branch ${branchName} in ${sitePath}`);
    
    const git = this.getGit(sitePath);
    
    try {
      await git.checkout(branchName);
    } catch (err) {
      error(`Failed to checkout branch ${branchName}: ${err}`);
      throw err;
    }
  }

  /**
   * Deletes a branch
   */
  async deleteBranch(sitePath: string, branchName: string, force: boolean = false): Promise<void> {
    info(`Deleting branch ${branchName} in ${sitePath}`);
    
    const git = this.getGit(sitePath);
    
    try {
      if (force) {
        await git.deleteLocalBranch(branchName, true);
      } else {
        await git.deleteLocalBranch(branchName);
      }
    } catch (err) {
      error(`Failed to delete branch ${branchName}: ${err}`);
      throw err;
    }
  }

  /**
   * Gets recent commit history
   */
  async getCommitHistory(sitePath: string, limit: number = 10): Promise<GitCommitInfo[]> {
    if (!this.isGitRepository(sitePath)) {
      return [];
    }

    const git = this.getGit(sitePath);
    
    try {
      const log = await git.log({ maxCount: limit });
      
      return log.all.map(commit => ({
        hash: commit.hash.substring(0, 7),
        message: commit.message,
        author: commit.author_name,
        date: new Date(commit.date)
      }));
    } catch (err) {
      warn(`Failed to get commit history for ${sitePath}: ${err}`);
      return [];
    }
  }

  /**
   * Updates a file and commits the change
   */
  async updateFile(sitePath: string, filePath: string, content: string, commitMessage?: string): Promise<string> {
    const fullPath = join(sitePath, filePath);
    
    // Ensure directory exists
    mkdirSync(dirname(fullPath), { recursive: true });
    
    // Write file
    writeFileSync(fullPath, content, 'utf8');
    
    // Generate commit message if not provided
    const message = commitMessage || `Update ${filePath}`;
    
    // Commit the change
    return await this.commitChanges(sitePath, message);
  }

  /**
   * Reads a file from a specific branch
   */
  async readFile(sitePath: string, filePath: string, branchName?: string): Promise<string | null> {
    const git = this.getGit(sitePath);
    
    try {
      if (branchName) {
        // Read from specific branch
        const content = await git.show([`${branchName}:${filePath}`]);
        return content;
      } else {
        // Read from working directory
        const fullPath = join(sitePath, filePath);
        if (existsSync(fullPath)) {
          return readFileSync(fullPath, 'utf8');
        }
        return null;
      }
    } catch (err) {
      debug(`Failed to read file ${filePath}: ${err}`);
      return null;
    }
  }

  /**
   * Creates a default .gitignore file for a site
   */
  private async createDefaultGitignore(sitePath: string): Promise<void> {
    const gitignoreContent = `# Dependencies
node_modules/
.pnp
.pnp.js

# Production builds
/build
/dist
/out
/.next/
/.nuxt/

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Dependency directories
node_modules/
jspm_packages/

# TypeScript cache
*.tsbuildinfo

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# next.js build output
.next

# nuxt.js build output
.nuxt

# vuepress build output
.vuepress/dist

# Serverless directories
.serverless

# FuseBox cache
.fusebox/

# DynamoDB Local files
.dynamodb/

# TernJS port file
.tern-port

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db
`;

    const gitignorePath = join(sitePath, '.gitignore');
    writeFileSync(gitignorePath, gitignoreContent, 'utf8');
    debug(`Created .gitignore at ${gitignorePath}`);
  }

  /**
   * Generates a commit message based on Git status
   */
  private generateCommitMessage(status: GitStatus): string {
    const changes = [...status.modified, ...status.untracked];
    
    if (changes.length === 0) {
      return 'Update files';
    }
    
    if (changes.length === 1) {
      return `Update ${changes[0]}`;
    }
    
    if (changes.length <= 3) {
      return `Update ${changes.join(', ')}`;
    }
    
    return `Update ${changes.length} files`;
  }
}

// Export singleton instance
export const gitService = GitService.getInstance();