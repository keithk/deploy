import { spawn, ChildProcess } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
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
 * Git Manager Service
 * Handles all Git operations for site repositories
 */
export class GitManager {
  private static instance: GitManager;

  static getInstance(): GitManager {
    if (!GitManager.instance) {
      GitManager.instance = new GitManager();
    }
    return GitManager.instance;
  }

  /**
   * Checks if a directory is a Git repository
   */
  isGitRepository(sitePath: string): boolean {
    const gitDir = join(sitePath, '.git');
    return existsSync(gitDir);
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

    // Initialize the repository
    await this.executeGitCommand(sitePath, ['init']);
    
    // Create default .gitignore
    await this.createDefaultGitignore(sitePath);
    
    // Make initial commit
    await this.executeGitCommand(sitePath, ['add', '.']);
    await this.executeGitCommand(sitePath, [
      'commit', 
      '-m', 
      'Initial commit - Site created'
    ]);
    
    info(`Git repository initialized at ${sitePath}`);
  }

  /**
   * Creates a new editing branch from main
   */
  async createEditBranch(sitePath: string, baseName: string = 'edit'): Promise<string> {
    const timestamp = Date.now();
    const branchName = `${baseName}-${timestamp}`;
    
    debug(`Creating edit branch: ${branchName} at ${sitePath}`);
    
    // Ensure we're on main branch
    await this.executeGitCommand(sitePath, ['checkout', 'main']);
    
    // Create and checkout new branch
    await this.executeGitCommand(sitePath, ['checkout', '-b', branchName]);
    
    info(`Created edit branch: ${branchName}`);
    return branchName;
  }

  /**
   * Lists all branches in the repository
   */
  async listBranches(sitePath: string): Promise<GitBranch[]> {
    try {
      const { stdout } = await this.executeGitCommand(sitePath, [
        'branch', '--format=%(refname:short)|%(HEAD)|%(objectname:short)|%(creatordate:iso)'
      ]);
      
      const branches: GitBranch[] = [];
      const lines = stdout.trim().split('\n').filter(line => line);
      
      for (const line of lines) {
        const [name, current, commit, dateStr] = line.split('|');
        if (!name || !current || !commit || !dateStr) {
          continue; // Skip malformed lines
        }
        
        branches.push({
          name: name.trim(),
          current: current.trim() === '*',
          commit: commit.trim(),
          created: new Date(dateStr.trim())
        });
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

    try {
      // Get current branch
      const { stdout: branchOutput } = await this.executeGitCommand(sitePath, [
        'rev-parse', '--abbrev-ref', 'HEAD'
      ]);
      const currentBranch = branchOutput.trim();

      // Get status
      const { stdout: statusOutput } = await this.executeGitCommand(sitePath, [
        'status', '--porcelain'
      ]);

      const untracked: string[] = [];
      const modified: string[] = [];
      
      const lines = statusOutput.trim().split('\n').filter(line => line);
      for (const line of lines) {
        const status = line.substring(0, 2);
        const file = line.substring(3);
        
        if (status.startsWith('?')) {
          untracked.push(file);
        } else {
          modified.push(file);
        }
      }

      return {
        isRepository: true,
        currentBranch,
        isDirty: untracked.length > 0 || modified.length > 0,
        untracked,
        modified
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
    
    // Add all changes
    await this.executeGitCommand(sitePath, ['add', '.']);
    
    // Commit changes
    const { stdout } = await this.executeGitCommand(sitePath, [
      'commit', '-m', commitMessage
    ]);
    
    // Get commit hash
    const { stdout: hashOutput } = await this.executeGitCommand(sitePath, [
      'rev-parse', 'HEAD'
    ]);
    
    const commitHash = hashOutput.trim().substring(0, 7);
    info(`Committed changes: ${commitHash}`);
    
    return commitHash;
  }

  /**
   * Merges a branch into main and deletes the branch
   */
  async mergeBranchToMain(sitePath: string, branchName: string): Promise<void> {
    info(`Merging branch ${branchName} to main in ${sitePath}`);
    
    // Switch to main branch
    await this.executeGitCommand(sitePath, ['checkout', 'main']);
    
    // Merge the branch
    await this.executeGitCommand(sitePath, ['merge', branchName]);
    
    // Delete the branch
    await this.executeGitCommand(sitePath, ['branch', '-d', branchName]);
    
    info(`Successfully merged and deleted branch ${branchName}`);
  }

  /**
   * Switches to a specific branch
   */
  async checkoutBranch(sitePath: string, branchName: string): Promise<void> {
    debug(`Switching to branch ${branchName} in ${sitePath}`);
    await this.executeGitCommand(sitePath, ['checkout', branchName]);
  }

  /**
   * Deletes a branch
   */
  async deleteBranch(sitePath: string, branchName: string, force: boolean = false): Promise<void> {
    const flag = force ? '-D' : '-d';
    info(`Deleting branch ${branchName} in ${sitePath}`);
    await this.executeGitCommand(sitePath, ['branch', flag, branchName]);
  }

  /**
   * Gets recent commit history
   */
  async getCommitHistory(sitePath: string, limit: number = 10): Promise<GitCommitInfo[]> {
    try {
      const { stdout } = await this.executeGitCommand(sitePath, [
        'log', 
        `--max-count=${limit}`,
        '--format=%H|%s|%an|%ad',
        '--date=iso'
      ]);

      const commits: GitCommitInfo[] = [];
      const lines = stdout.trim().split('\n').filter(line => line);
      
      for (const line of lines) {
        const [hash, message, author, dateStr] = line.split('|');
        if (!hash || !message) {
          continue; // Skip malformed lines
        }
        
        commits.push({
          hash: hash.substring(0, 7),
          message: message.trim(),
          author: author?.trim() || "",
          date: new Date(dateStr?.trim() || "")
        });
      }

      return commits;
    } catch (err) {
      warn(`Failed to get commit history for ${sitePath}: ${err}`);
      return [];
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

  /**
   * Executes a Git command in the specified directory
   */
  private executeGitCommand(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn('git', args, {
        cwd,
        env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin' },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('exit', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Git command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      childProcess.on('error', (err) => {
        reject(new Error(`Failed to execute git command: ${err.message}`));
      });
    });
  }
}

// Export singleton instance
export const gitManager = GitManager.getInstance();