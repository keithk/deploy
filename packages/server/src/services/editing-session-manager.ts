import { Database } from '@keithk/deploy-core/src/database/database';
import type { SiteConfig } from '@keithk/deploy-core';
import { gitManager } from './git-manager';
import { containerManager } from './container-manager';
import { caddyManager } from './caddy-manager';
import { debug, info, warn, error } from '../utils/logging';

export interface EditingSession {
  id: number;
  userId: number;
  siteName: string;
  branchName: string;
  containerName?: string;
  status: 'active' | 'inactive' | 'deploying' | 'failed';
  mode: 'edit' | 'preview';
  previewPort?: number;
  previewUrl?: string;
  createdAt: Date;
  lastActivity: Date;
  lastSave?: Date;
  lastCommit?: Date;
  baseCommitHash?: string;
  currentCommitHash?: string;
  commitsCount: number;
  expiresAt?: Date;
  autoCleanup: boolean;
}

export interface SessionCreateOptions {
  userId: number;
  siteName: string;
  sitePath: string;
  baseName?: string;
  expirationMinutes?: number;
}

export interface SessionCommitOptions {
  message?: string;
  author?: string;
}

/**
 * Editing Session Manager
 * Manages Git-based editing sessions with preview containers
 */
export class EditingSessionManager {
  private static instance: EditingSessionManager;
  private db: Database;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.db = Database.getInstance();
    this.startCleanupScheduler();
  }

  static getInstance(): EditingSessionManager {
    if (!EditingSessionManager.instance) {
      EditingSessionManager.instance = new EditingSessionManager();
    }
    return EditingSessionManager.instance;
  }

  /**
   * Creates a new editing session with Git branch and preview container
   */
  async createSession(options: SessionCreateOptions): Promise<EditingSession> {
    const { userId, siteName, sitePath, baseName = 'edit', expirationMinutes = 180 } = options;
    
    info(`Creating editing session for site: ${siteName}, user: ${userId}`);
    
    // Check if user already has too many active sessions (max 10)
    await this.enforceSessionLimits(userId);
    
    // Create Git branch
    const branchName = await gitManager.createEditBranch(sitePath, baseName);
    
    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);
    
    // Get base commit hash
    const status = await gitManager.getStatus(sitePath);
    const baseCommitHash = await this.getCurrentCommitHash(sitePath);
    
    // Insert session record using prepared statement
    const stmt = this.db.prepare(`
      INSERT INTO editing_sessions (
        user_id, site_name, branch_name, status, mode,
        base_commit_hash, current_commit_hash, commits_count,
        expires_at, auto_cleanup, created_at, last_activity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      userId, siteName, branchName, 'active', 'edit',
      baseCommitHash, baseCommitHash, 0,
      expiresAt.toISOString(), true,
      new Date().toISOString(), new Date().toISOString()
    );
    
    const sessionId = Number(result.lastInsertRowid);
    
    // Create preview container
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Failed to retrieve created session ${sessionId}`);
    }
    await this.startPreviewContainer(session, sitePath);
    
    info(`Created editing session ${sessionId} with branch ${branchName}`);
    return session;
  }

  /**
   * Gets an active editing session by ID
   */
  async getSession(sessionId: number): Promise<EditingSession | null> {
    const results = this.db.query<any>(`
      SELECT * FROM editing_sessions WHERE id = ?
    `, [sessionId]);
    
    if (results.length === 0) {
      return null;
    }
    
    return this.mapDbRowToSession(results[0]);
  }

  /**
   * Gets an active editing session by site name and user
   */
  async getActiveSession(userId: number, siteName: string): Promise<EditingSession | null> {
    const results = this.db.query<any>(`
      SELECT * FROM editing_sessions 
      WHERE user_id = ? AND site_name = ? AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `, [userId, siteName]);
    
    if (results.length === 0) {
      return null;
    }
    
    return this.mapDbRowToSession(results[0]);
  }

  /**
   * Lists all sessions for a user
   */
  async getUserSessions(userId: number): Promise<EditingSession[]> {
    const results = this.db.query<any>(`
      SELECT * FROM editing_sessions 
      WHERE user_id = ? 
      ORDER BY last_activity DESC
    `, [userId]);
    
    return results.map(row => this.mapDbRowToSession(row));
  }

  /**
   * Updates session activity timestamp
   */
  async updateActivity(sessionId: number): Promise<void> {
    this.db.run(`
      UPDATE editing_sessions 
      SET last_activity = ? 
      WHERE id = ?
    `, [new Date().toISOString(), sessionId]);
  }

  /**
   * Commits changes in a session
   */
  async commitSession(sessionId: number, sitePath: string, options: SessionCommitOptions = {}): Promise<string> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Switch to the session branch
    await gitManager.checkoutBranch(sitePath, session.branchName);
    
    // Commit changes
    const commitHash = await gitManager.commitChanges(sitePath, options.message);
    
    if (commitHash) {
      // Update session record
      const now = new Date().toISOString();
      this.db.run(`
        UPDATE editing_sessions 
        SET current_commit_hash = ?, commits_count = commits_count + 1,
            last_commit = ?, last_save = ?, last_activity = ?
        WHERE id = ?
      `, [commitHash, now, now, now, sessionId]);
      
      // Record commit in branch_commits table
      const author = options.author || 'Anonymous';
      this.db.run(`
        INSERT INTO branch_commits (
          session_id, site_name, branch_name, commit_hash, 
          commit_message, commit_author, files_changed
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        sessionId, session.siteName, session.branchName, 
        commitHash, options.message || 'Save changes', author, 0
      ]);
      
      info(`Committed changes in session ${sessionId}: ${commitHash}`);
    }
    
    return commitHash;
  }

  /**
   * Deploys session changes by merging to main
   */
  async deploySession(sessionId: number, sitePath: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    info(`Deploying session ${sessionId}: merging ${session.branchName} to main`);
    
    // Update session status
    this.db.run(`
      UPDATE editing_sessions SET status = 'deploying' WHERE id = ?
    `, [sessionId]);
    
    try {
      // Merge branch to main
      await gitManager.mergeBranchToMain(sitePath, session.branchName);
      
      // Clean up session
      await this.cleanupSession(sessionId);
      
      info(`Successfully deployed session ${sessionId}`);
      
    } catch (err) {
      // Mark as failed
      this.db.run(`
        UPDATE editing_sessions SET status = 'failed' WHERE id = ?
      `, [sessionId]);
      
      error(`Failed to deploy session ${sessionId}: ${err}`);
      throw err;
    }
  }

  /**
   * Cancels an active editing session
   */
  async cancelSession(sessionId: number, sitePath: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    info(`Canceling session ${sessionId}: ${session.branchName}`);
    
    // Update session status to inactive
    this.db.run(`
      UPDATE editing_sessions SET status = 'inactive' WHERE id = ?
    `, [sessionId]);
    
    // Clean up session resources (container, branch)
    await this.cleanupSession(sessionId);
    
    info(`Successfully canceled session ${sessionId}`);
  }

  /**
   * Cleans up a session (removes branch and container)
   */
  async cleanupSession(sessionId: number): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return;
    }
    
    info(`Cleaning up session ${sessionId}: ${session.branchName}`);
    
    // Deregister dynamic route from CaddyManager
    try {
      const removed = await caddyManager.removePreviewRoute(sessionId);
      if (removed) {
        info(`Deregistered Caddy route for session ${sessionId}`);
      } else {
        debug(`No Caddy route found to remove for session ${sessionId}`);
      }
    } catch (caddyErr) {
      warn(`Failed to deregister Caddy route for session ${sessionId}: ${caddyErr}`);
      // Continue with cleanup even if Caddy route removal fails
    }
    
    // Stop preview container if it exists
    if (session.containerName) {
      try {
        await containerManager.instance.stopContainer(session.containerName);
        
        // For Docker containers, also force removal
        const container = containerManager.instance.getContainer(session.containerName);
        if (container?.strategy === 'docker') {
          try {
            // Force remove Docker container and image
            await this.forceCleanupDockerContainer(session.containerName, session.siteName);
          } catch (dockerErr) {
            warn(`Failed to cleanup Docker resources for ${session.containerName}: ${dockerErr}`);
          }
        }
      } catch (err) {
        warn(`Failed to stop container ${session.containerName}: ${err}`);
      }
    }
    
    // Delete Git branch (force delete to handle unmerged changes)
    // Note: We don't delete the branch here if it was just merged in deploySession
    if (session.status !== 'deploying') {
      try {
        const sitePath = this.getSitePathFromSession(session);
        await gitManager.deleteBranch(sitePath, session.branchName, true);
      } catch (err) {
        warn(`Failed to delete branch ${session.branchName}: ${err}`);
      }
    }
    
    // Remove session record
    this.db.run(`DELETE FROM editing_sessions WHERE id = ?`, [sessionId]);
    
    info(`Session ${sessionId} cleaned up successfully`);
  }

  /**
   * Enforces session limits per user
   */
  private async enforceSessionLimits(userId: number, maxSessions: number = 10): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    const activeSessions = sessions.filter(s => s.status === 'active');
    
    if (activeSessions.length >= maxSessions) {
      // Clean up oldest sessions
      const oldestSessions = activeSessions
        .sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime())
        .slice(0, activeSessions.length - maxSessions + 1);
      
      for (const session of oldestSessions) {
        warn(`Cleaning up old session ${session.id} to make room for new session`);
        await this.cleanupSession(session.id);
      }
    }
  }

  /**
   * Starts a preview container for a session
   */
  private async startPreviewContainer(session: EditingSession, sitePath: string): Promise<void> {
    const containerName = `${session.branchName}-${session.siteName}-preview`;
    const previewPort = 4000 + session.id; // Start preview ports at 4000+
    
    try {
      // Create a site config for the preview container
      const previewSiteConfig: SiteConfig = {
        subdomain: `${session.branchName}-${session.siteName}`,
        route: `/${session.branchName}-${session.siteName}`,
        path: sitePath,
        type: 'passthrough', // Default to passthrough for preview
        proxyPort: previewPort,
        useContainers: true
      };
      
      // Checkout to the preview branch before starting container
      await gitManager.checkoutBranch(sitePath, session.branchName);
      
      // Create and start the preview container
      const container = await containerManager.instance.createContainer(previewSiteConfig, 'preview');
      
      if (!container) {
        throw new Error('Container creation returned null - container manager failed to create container');
      }
      
      // Generate preview URL using subdomain pattern (single level for wildcard SSL)
      const projectDomain = process.env.PROJECT_DOMAIN || 'dev.deploy';
      const previewSubdomain = `${session.branchName}-${session.siteName}`;
      const previewUrl = `https://${previewSubdomain}.${projectDomain}`;
      
      // Update session with container info
      this.db.run(`
        UPDATE editing_sessions 
        SET container_name = ?, preview_port = ?, preview_url = ?
        WHERE id = ?
      `, [
        container.name, 
        container.port, 
        previewUrl,
        session.id
      ]);
      
      // Update the session object with the new data
      session.containerName = container.name;
      session.previewPort = container.port;
      session.previewUrl = previewUrl;
      
      // Register dynamic route with CaddyManager
      try {
        const route = await caddyManager.addPreviewRoute(
          session.id,
          session.siteName,
          session.branchName,
          container.port
        );
        info(`Registered Caddy route: ${previewSubdomain}.${projectDomain} -> localhost:${container.port}`);
        debug(`Route details: ${JSON.stringify(route, null, 2)}`);
      } catch (caddyErr) {
        warn(`Failed to register Caddy route for session ${session.id}: ${caddyErr}`);
        // Don't fail the entire operation - container is still running
      }
      
      info(`Preview container started for session ${session.id}: ${container.name} on port ${container.port}`);
      
    } catch (err) {
      error(`Failed to start preview container for session ${session.id}: ${err}`);
      throw err;
    }
  }

  /**
   * Gets current commit hash for a repository
   */
  private async getCurrentCommitHash(sitePath: string): Promise<string> {
    try {
      const status = await gitManager.getStatus(sitePath);
      const history = await gitManager.getCommitHistory(sitePath, 1);
      return history[0]?.hash || '';
    } catch (err) {
      return '';
    }
  }

  /**
   * Gets site path from session (placeholder - needs integration with site config)
   */
  private getSitePathFromSession(session: EditingSession): string {
    // This is a placeholder - we'll need to look up the actual site path
    // from the sites table or pass it through the session
    return `/path/to/sites/${session.siteName}`;
  }

  /**
   * Maps database row to EditingSession object
   */
  private mapDbRowToSession(row: any): EditingSession {
    return {
      id: row.id,
      userId: row.user_id,
      siteName: row.site_name,
      branchName: row.branch_name,
      containerName: row.container_name,
      status: row.status,
      mode: row.mode,
      previewPort: row.preview_port,
      previewUrl: row.preview_url,
      createdAt: new Date(row.created_at),
      lastActivity: new Date(row.last_activity),
      lastSave: row.last_save ? new Date(row.last_save) : undefined,
      lastCommit: row.last_commit ? new Date(row.last_commit) : undefined,
      baseCommitHash: row.base_commit_hash,
      currentCommitHash: row.current_commit_hash,
      commitsCount: row.commits_count,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      autoCleanup: row.auto_cleanup
    };
  }

  /**
   * Starts the cleanup scheduler for expired sessions
   */
  private startCleanupScheduler(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
    
    info('Started editing session cleanup scheduler');
  }

  /**
   * Cleans up expired sessions
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const expiredSessions = this.db.query<any>(`
      SELECT id FROM editing_sessions 
      WHERE auto_cleanup = 1 
      AND expires_at < ? 
      AND status IN ('active', 'inactive')
    `, [new Date().toISOString()]);
    
    for (const session of expiredSessions) {
      try {
        await this.cleanupSession(session.id);
        debug(`Cleaned up expired session ${session.id}`);
      } catch (err) {
        warn(`Failed to cleanup expired session ${session.id}: ${err}`);
      }
    }
    
    if (expiredSessions.length > 0) {
      info(`Cleaned up ${expiredSessions.length} expired editing sessions`);
    }
    
    // Also cleanup expired Caddy routes
    try {
      const expiredRoutes = await caddyManager.cleanupExpiredRoutes();
      if (expiredRoutes > 0) {
        info(`Cleaned up ${expiredRoutes} expired Caddy routes`);
      }
    } catch (err) {
      warn(`Failed to cleanup expired Caddy routes: ${err}`);
    }
  }

  /**
   * Force cleanup Docker container and associated image
   */
  private async forceCleanupDockerContainer(containerName: string, siteName: string): Promise<void> {
    try {
      const { spawn } = await import('child_process');
      
      // Stop and remove container
      const stopCmd = spawn('docker', ['stop', containerName]);
      await new Promise((resolve) => {
        stopCmd.on('close', resolve);
        setTimeout(resolve, 5000); // Timeout after 5s
      });
      
      const removeCmd = spawn('docker', ['rm', '-f', containerName]);
      await new Promise((resolve) => {
        removeCmd.on('close', resolve);
        setTimeout(resolve, 3000); // Timeout after 3s
      });
      
      // Remove associated Docker image
      const imageName = `deploy-${containerName}:latest`;
      const removeImageCmd = spawn('docker', ['rmi', '-f', imageName]);
      await new Promise((resolve) => {
        removeImageCmd.on('close', resolve);
        setTimeout(resolve, 3000); // Timeout after 3s
      });
      
      info(`Cleaned up Docker resources for container: ${containerName}`);
    } catch (err) {
      warn(`Docker cleanup error for ${containerName}: ${err}`);
    }
  }

  /**
   * Restarts the preview container for a session to pick up file changes
   */
  async restartPreviewContainer(sessionId: number): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session || !session.containerName) {
      warn(`No container to restart for session ${sessionId}`);
      return;
    }
    
    info(`Restarting preview container for session ${sessionId}: ${session.containerName}`);
    
    try {
      // Check if container exists and is running
      const isRunning = await containerManager.instance.isContainerRunning(session.containerName);
      
      if (isRunning) {
        // Stop the current container
        info(`Stopping existing container ${session.containerName}`);
        await containerManager.instance.stopContainer(session.containerName);
        
        // Wait a moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        info(`Container ${session.containerName} is not running, will create new one`);
      }
      
      // Get the site path and restart/start the container
      const sitePath = this.getSitePathFromSession(session);
      await this.startPreviewContainer(session, sitePath);
      
      info(`Successfully restarted preview container for session ${sessionId}`);
    } catch (err) {
      error(`Failed to restart preview container for session ${sessionId}: ${err}`);
      // Don't throw the error - log it but continue
      // This allows the file save to succeed even if container restart fails
    }
  }

  /**
   * Stops the cleanup scheduler
   */
  public stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      info('Stopped editing session cleanup scheduler');
    }
  }
}

// Export singleton instance
export const editingSessionManager = EditingSessionManager.getInstance();