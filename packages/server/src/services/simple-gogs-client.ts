import { debug, error, info, warn } from "@keithk/deploy-core";

/**
 * Repository information returned by Gogs
 */
interface GogsRepository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  empty: boolean;
  private: boolean;
  fork: boolean;
  parent: any;
  mirror: boolean;
  size: number;
  language: string;
  languages_url: string;
  html_url: string;
  ssh_url: string;
  clone_url: string;
  website: string;
  stars_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  default_branch: string;
  created_at: string;
  updated_at: string;
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

/**
 * Branch information returned by Gogs
 */
interface GogsBranch {
  name: string;
  commit: {
    id: string;
    message: string;
    url: string;
    author: {
      name: string;
      email: string;
      username: string;
    };
    committer: {
      name: string;
      email: string;
      username: string;
    };
    timestamp: string;
  };
}

/**
 * File content for API operations
 */
interface GogsFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: string;
  content: string;
  encoding: string;
}

/**
 * Simple Gogs client for basic Git operations
 * Focuses only on the operations needed for the Deploy editing workflow
 */
export class SimpleGogsClient {
  private baseUrl: string;
  private token: string;
  private username: string;

  constructor(baseUrl: string, token: string, username = 'deploy') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.token = token;
    this.username = username;
  }

  /**
   * Make authenticated request to Gogs API
   */
  private async request<T>(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', 
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `token ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    try {
      debug(`Gogs API ${method} ${url}`);
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gogs API error ${response.status}: ${errorText}`);
      }

      // Handle empty responses for DELETE operations
      if (method === 'DELETE' && response.status === 204) {
        return {} as T;
      }

      const data = await response.json();
      debug(`Gogs API response: ${JSON.stringify(data).slice(0, 200)}...`);
      return data;
    } catch (err) {
      error(`Gogs API request failed:`, err);
      throw err;
    }
  }

  /**
   * Create a new repository for a site
   */
  async createRepo(siteName: string, description?: string): Promise<{ clone_url: string }> {
    try {
      info(`Creating Gogs repository for site: ${siteName}`);
      
      const repoData = {
        name: siteName,
        description: description || `Repository for ${siteName} site`,
        private: false,
        auto_init: true,
        readme: 'Default'
      };

      const repo = await this.request<GogsRepository>(
        `/user/repos`, 
        'POST', 
        repoData
      );

      info(`Repository created: ${repo.clone_url}`);
      return { clone_url: repo.clone_url };
    } catch (err) {
      error(`Failed to create repository ${siteName}:`, err);
      throw new Error(`Repository creation failed: ${err}`);
    }
  }

  /**
   * Check if a repository exists
   */
  async repoExists(siteName: string): Promise<boolean> {
    try {
      await this.request<GogsRepository>(`/repos/${this.username}/${siteName}`);
      return true;
    } catch (err) {
      debug(`Repository ${siteName} does not exist:`, err);
      return false;
    }
  }

  /**
   * Get repository information
   */
  async getRepo(siteName: string): Promise<GogsRepository | null> {
    try {
      return await this.request<GogsRepository>(`/repos/${this.username}/${siteName}`);
    } catch (err) {
      debug(`Failed to get repository ${siteName}:`, err);
      return null;
    }
  }

  /**
   * Create a new branch from main
   */
  async createBranch(siteName: string, branchName: string, fromBranch = 'main'): Promise<void> {
    try {
      info(`Creating branch ${branchName} from ${fromBranch} in ${siteName}`);
      
      // First get the SHA of the source branch
      const sourceBranch = await this.request<GogsBranch>(
        `/repos/${this.username}/${siteName}/branches/${fromBranch}`
      );
      
      // Create new branch reference
      const branchData = {
        ref: `refs/heads/${branchName}`,
        sha: sourceBranch.commit.id
      };

      await this.request(
        `/repos/${this.username}/${siteName}/git/refs`,
        'POST',
        branchData
      );

      info(`Branch ${branchName} created successfully`);
    } catch (err) {
      error(`Failed to create branch ${branchName} in ${siteName}:`, err);
      throw new Error(`Branch creation failed: ${err}`);
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(siteName: string, branchName: string): Promise<void> {
    try {
      info(`Deleting branch ${branchName} from ${siteName}`);
      
      await this.request(
        `/repos/${this.username}/${siteName}/git/refs/heads/${branchName}`,
        'DELETE'
      );

      info(`Branch ${branchName} deleted successfully`);
    } catch (err) {
      error(`Failed to delete branch ${branchName} from ${siteName}:`, err);
      throw new Error(`Branch deletion failed: ${err}`);
    }
  }

  /**
   * List branches in a repository
   */
  async listBranches(siteName: string): Promise<string[]> {
    try {
      const branches = await this.request<GogsBranch[]>(
        `/repos/${this.username}/${siteName}/branches`
      );
      
      return branches.map(branch => branch.name);
    } catch (err) {
      error(`Failed to list branches for ${siteName}:`, err);
      throw new Error(`Branch listing failed: ${err}`);
    }
  }

  /**
   * Update a file in the repository
   */
  async updateFile(
    siteName: string, 
    filepath: string, 
    content: string, 
    branchName: string,
    message: string
  ): Promise<void> {
    try {
      info(`Updating file ${filepath} in ${siteName}:${branchName}`);
      
      // Get current file content to get SHA (required for updates)
      let currentFile: GogsFileContent | null = null;
      try {
        currentFile = await this.request<GogsFileContent>(
          `/repos/${this.username}/${siteName}/contents/${filepath}?ref=${branchName}`
        );
      } catch (err) {
        // File doesn't exist, that's okay for new files
        debug(`File ${filepath} doesn't exist, will create new file`);
      }

      const fileData = {
        message,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        branch: branchName,
        ...(currentFile && { sha: currentFile.sha })
      };

      await this.request(
        `/repos/${this.username}/${siteName}/contents/${filepath}`,
        'PUT',
        fileData
      );

      info(`File ${filepath} updated successfully`);
    } catch (err) {
      error(`Failed to update file ${filepath} in ${siteName}:`, err);
      throw new Error(`File update failed: ${err}`);
    }
  }

  /**
   * Get file content from repository
   */
  async getFile(siteName: string, filepath: string, branchName: string): Promise<string | null> {
    try {
      const file = await this.request<GogsFileContent>(
        `/repos/${this.username}/${siteName}/contents/${filepath}?ref=${branchName}`
      );
      
      // Decode base64 content
      return Buffer.from(file.content, 'base64').toString('utf-8');
    } catch (err) {
      debug(`Failed to get file ${filepath} from ${siteName}:${branchName}:`, err);
      return null;
    }
  }

  /**
   * Delete entire repository
   */
  async deleteRepo(siteName: string): Promise<void> {
    try {
      info(`Deleting repository ${siteName}`);
      
      await this.request(
        `/repos/${this.username}/${siteName}`,
        'DELETE'
      );

      info(`Repository ${siteName} deleted successfully`);
    } catch (err) {
      error(`Failed to delete repository ${siteName}:`, err);
      throw new Error(`Repository deletion failed: ${err}`);
    }
  }

  /**
   * Get the clone URL for a repository
   */
  getCloneUrl(siteName: string): string {
    return `${this.baseUrl}/${this.username}/${siteName}.git`;
  }

  /**
   * Get the web URL for a repository
   */
  getWebUrl(siteName: string): string {
    return `${this.baseUrl}/${this.username}/${siteName}`;
  }
}

/**
 * Factory function to create a configured Gogs client
 */
export function createGogsClient(): SimpleGogsClient {
  const baseUrl = process.env.GOGS_URL || 'http://localhost:3010';
  const token = process.env.GOGS_TOKEN || '';
  const username = process.env.GOGS_USERNAME || 'deploy';

  if (!token) {
    warn('GOGS_TOKEN environment variable not set. Some operations may fail.');
  }

  return new SimpleGogsClient(baseUrl, token, username);
}

// Export singleton instance for convenience
export const gogsClient = createGogsClient();