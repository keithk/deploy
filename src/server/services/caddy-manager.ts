import { promises as fs, existsSync } from 'fs';
import { join, dirname } from 'path';
import { spawn, execSync } from 'child_process';
import { generateCaddyfileContent } from '../../core/utils/caddyfile';
import { debug, info, warn, error } from '../utils/logging';

export interface DynamicRoute {
  /** Full subdomain (e.g., "edit-1756169774399-home.dev.deploy") */
  subdomain: string;
  /** Target port to proxy to (e.g., 4001) */
  targetPort: number;
  /** Session ID for tracking */
  sessionId: number;
  /** Site name for grouping */
  siteName: string;
  /** Creation timestamp */
  createdAt: Date;
}

export interface CaddyConfig {
  /** Path to Caddyfile */
  caddyfilePath: string;
  /** Path to Caddy data directory */
  dataDir?: string;
  /** Project domain (e.g., "dev.deploy") */
  projectDomain: string;
  /** Whether Caddy is running in development mode */
  isDevelopment: boolean;
  /** Custom SSL certificate paths for development */
  sslCertPath?: string;
  sslKeyPath?: string;
}

/**
 * CaddyManager Service
 * 
 * Manages dynamic Caddy configurations for preview sessions.
 * Provides methods to add/remove subdomain routes and reload Caddy without downtime.
 */
export class CaddyManager {
  private static instance: CaddyManager;
  private config: CaddyConfig;
  private dynamicRoutes = new Map<string, DynamicRoute>();
  private reloadDebounceTimer: NodeJS.Timeout | null = null;
  private isReloading = false;

  constructor(config: CaddyConfig) {
    this.config = config;
    this.loadExistingRoutes();
  }

  static getInstance(config?: CaddyConfig): CaddyManager {
    if (!CaddyManager.instance) {
      if (!config) {
        // Default configuration for Dial Up Deploy
        config = {
          caddyfilePath: join(process.cwd(), '.deploy', 'caddy', 'Caddyfile'),
          dataDir: join(process.cwd(), '.deploy', 'caddy', 'data'),
          projectDomain: process.env.PROJECT_DOMAIN || 'dev.deploy',
          isDevelopment: process.env.NODE_ENV !== 'production',
          sslCertPath: join(process.cwd(), '.deploy', 'ssl', 'dev', 'dev.deploy.crt'),
          sslKeyPath: join(process.cwd(), '.deploy', 'ssl', 'dev', 'dev.deploy.key'),
        };
      }
      CaddyManager.instance = new CaddyManager(config);
    }
    return CaddyManager.instance;
  }

  /**
   * Adds a dynamic route for a preview session
   * @param sessionId - The editing session ID
   * @param siteName - The site name
   * @param branchName - The Git branch name
   * @param targetPort - The container port to proxy to
   * @returns Promise that resolves when route is added and Caddy is reloaded
   */
  async addPreviewRoute(
    sessionId: number,
    siteName: string,
    branchName: string,
    targetPort: number
  ): Promise<DynamicRoute> {
    const subdomain = `${branchName}-${siteName}.${this.config.projectDomain}`;
    
    info(`Adding preview route: ${subdomain} -> localhost:${targetPort}`);

    const route: DynamicRoute = {
      subdomain,
      targetPort,
      sessionId,
      siteName,
      createdAt: new Date(),
    };

    this.dynamicRoutes.set(subdomain, route);
    
    // Debounced reload to handle multiple rapid additions
    await this.debouncedReload();
    
    debug(`Preview route added: ${subdomain}`);
    return route;
  }

  /**
   * Removes a dynamic route for a preview session
   * @param sessionId - The editing session ID to remove
   * @returns Promise that resolves when route is removed and Caddy is reloaded
   */
  async removePreviewRoute(sessionId: number): Promise<boolean> {
    // Find route by session ID
    const routeEntry = Array.from(this.dynamicRoutes.entries())
      .find(([_, route]) => route.sessionId === sessionId);
    
    if (!routeEntry) {
      warn(`No dynamic route found for session ${sessionId}`);
      return false;
    }

    const [subdomain, route] = routeEntry;
    info(`Removing preview route: ${subdomain}`);

    this.dynamicRoutes.delete(subdomain);
    
    // Debounced reload to handle multiple rapid removals
    await this.debouncedReload();
    
    debug(`Preview route removed: ${subdomain}`);
    return true;
  }

  /**
   * Gets all current dynamic routes
   */
  getDynamicRoutes(): DynamicRoute[] {
    return Array.from(this.dynamicRoutes.values());
  }

  /**
   * Gets a specific dynamic route by subdomain
   */
  getDynamicRoute(subdomain: string): DynamicRoute | undefined {
    return this.dynamicRoutes.get(subdomain);
  }

  /**
   * Cleans up expired routes (older than 4 hours by default)
   * @param maxAgeHours - Maximum age in hours before cleanup
   */
  async cleanupExpiredRoutes(maxAgeHours: number = 4): Promise<number> {
    const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
    const expiredRoutes: string[] = [];

    for (const [subdomain, route] of this.dynamicRoutes.entries()) {
      if (route.createdAt < cutoffTime) {
        expiredRoutes.push(subdomain);
      }
    }

    if (expiredRoutes.length > 0) {
      info(`Cleaning up ${expiredRoutes.length} expired dynamic routes`);
      
      for (const subdomain of expiredRoutes) {
        this.dynamicRoutes.delete(subdomain);
      }
      
      await this.debouncedReload();
    }

    return expiredRoutes.length;
  }

  /**
   * Generates the complete Caddyfile content including dynamic routes
   */
  async generateCaddyfileWithDynamicRoutes(): Promise<string> {
    try {
      // Start with development-optimized base configuration
      let content = this.generateBaseCaddyfileConfig();

      // Add discovered sites if any exist
      try {
        const sitesDir = join(process.cwd(), 'sites');
        const siteContent = await generateCaddyfileContent(
          this.config.projectDomain.replace(/^dev\./, ''), // Remove "dev." prefix for base domain
          sitesDir,
          { info, warning: warn }
        );
        
        // Extract just the site configurations (everything after the global block)
        const siteConfigMatch = siteContent.match(/^}\s*\n\n(.+)$/s);
        if (siteConfigMatch && siteConfigMatch[1]) {
          content += '\n\n# Static site configurations\n';
          content += siteConfigMatch[1];
        }
      } catch (siteErr) {
        debug(`No static sites found or error loading: ${siteErr}`);
      }

      // Add dynamic routes section if we have any
      if (this.dynamicRoutes.size > 0) {
        content += '\n\n# Dynamic preview routes\n';
        
        for (const route of this.dynamicRoutes.values()) {
          const routeConfig = this.generateDynamicRouteConfig(route);
          content += `\n${routeConfig}\n`;
        }
      }

      return content;
    } catch (err) {
      error(`Failed to generate Caddyfile with dynamic routes: ${err}`);
      throw new Error(`Caddyfile generation failed: ${err}`);
    }
  }

  /**
   * Generates the base Caddyfile configuration optimized for the project
   */
  private generateBaseCaddyfileConfig(): string {
    const baseDomain = this.config.projectDomain.replace(/^dev\./, ''); // Remove "dev." prefix for base domain
    
    let caddyConfig = `{
  # Use project directory for storage
  storage file_system {
    root ${this.config.dataDir}
  }

  # Use local certificates for development
  local_certs
  
  # Enable debug logging in development
  ${this.config.isDevelopment ? 'debug' : ''}
  
  # Log configuration
  log {
    output file ${join(dirname(this.config.caddyfilePath), 'access.log')}
    format json
  }
}

# Root domain configuration
${baseDomain} {
  # Enable compression
  encode {
    gzip 6
    zstd
  }
  
  # Security headers
  header {
    -Server
    X-Content-Type-Options nosniff
    X-Frame-Options DENY
    X-XSS-Protection "1; mode=block"
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
  }
  
  # Proxy to main application with health monitoring
  reverse_proxy localhost:3000 {
    health_uri /health
    health_interval 30s
    health_timeout 5s
    flush_interval -1
  }
}

`;

    // If we're in development and using dev.deploy, add a config for dev.deploy itself
    if (this.config.isDevelopment && this.config.projectDomain.startsWith('dev.')) {
      caddyConfig += `# Dev domain configuration (our main domain)
${this.config.projectDomain} {${this.config.sslCertPath && this.config.sslKeyPath
  ? `
  tls ${this.config.sslCertPath} ${this.config.sslKeyPath}`
  : ''}
  
  # Enable compression
  encode {
    gzip 6
    zstd
  }
  
  # Security headers
  header {
    -Server
    X-Content-Type-Options nosniff
    X-Frame-Options DENY
    X-XSS-Protection "1; mode=block"
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
  }
  
  # Proxy to main application with health monitoring
  reverse_proxy localhost:3000 {
    header_up Host {host}
    header_up X-Real-IP {remote}
    header_up X-Forwarded-For {remote}
    header_up X-Forwarded-Proto {scheme}
    health_uri /health
    health_interval 30s
    health_timeout 5s
    flush_interval -1
  }
}

`;
    }

    caddyConfig += `# Wildcard subdomain configuration with SSL
*.${this.config.projectDomain} {${this.config.isDevelopment && this.config.sslCertPath && this.config.sslKeyPath
  ? `
  tls ${this.config.sslCertPath} ${this.config.sslKeyPath}`
  : ''}
  
  # Proxy to main application (will be overridden by specific dynamic routes)
  reverse_proxy localhost:3000 {
    header_up Host {host}
    header_up X-Real-IP {remote}
    header_up X-Forwarded-For {remote}
    header_up X-Forwarded-Proto {scheme}
  }
}`;

    return caddyConfig;
  }

  /**
   * Generates Caddy configuration for a single dynamic route
   */
  private generateDynamicRouteConfig(route: DynamicRoute): string {
    const sslConfig = this.config.isDevelopment && this.config.sslCertPath && this.config.sslKeyPath
      ? `  tls ${this.config.sslCertPath} ${this.config.sslKeyPath}`
      : '';

    return `${route.subdomain} {${sslConfig}
  
  # Enable compression for preview
  encode {
    gzip 6
    zstd
  }
  
  # Security headers for preview (allow iframe for editor)
  header {
    -Server
    X-Content-Type-Options nosniff
    X-XSS-Protection "1; mode=block"
    Content-Security-Policy "frame-ancestors 'self' https://editor.${this.config.projectDomain};"
  }
  
  # Proxy to preview container with health check
  reverse_proxy localhost:${route.targetPort} {
    header_up Host {host}
    header_up X-Real-IP {remote}
    header_up X-Forwarded-For {remote}
    header_up X-Forwarded-Proto {scheme}
    health_uri /
    health_interval 10s
    health_timeout 3s
    flush_interval -1
  }
}`;
  }

  /**
   * Writes the complete Caddyfile and reloads Caddy
   */
  async reloadCaddy(): Promise<void> {
    if (this.isReloading) {
      debug('Caddy reload already in progress, skipping...');
      return;
    }

    try {
      this.isReloading = true;
      info('Reloading Caddy configuration...');

      // Generate new Caddyfile content
      const content = await this.generateCaddyfileWithDynamicRoutes();

      // Ensure directory exists
      const caddyDir = dirname(this.config.caddyfilePath);
      if (!existsSync(caddyDir)) {
        await fs.mkdir(caddyDir, { recursive: true });
      }

      // Write new Caddyfile
      await fs.writeFile(this.config.caddyfilePath, content, 'utf8');
      debug(`Caddyfile written to: ${this.config.caddyfilePath}`);

      // Reload Caddy (graceful reload without downtime)
      await this.executeCaddyReload();

      info(`Caddy configuration reloaded successfully`);

    } catch (err) {
      error(`Failed to reload Caddy: ${err}`);
      throw new Error(`Caddy reload failed: ${err}`);
    } finally {
      this.isReloading = false;
    }
  }

  /**
   * Debounced reload to prevent excessive reloads during bulk operations
   */
  private async debouncedReload(): Promise<void> {
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
    }

    return new Promise((resolve, reject) => {
      this.reloadDebounceTimer = setTimeout(async () => {
        try {
          await this.reloadCaddy();
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 1000); // 1 second debounce
    });
  }

  /**
   * Executes Caddy reload command
   */
  private async executeCaddyReload(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Try using caddy reload command first
      const caddyReload = spawn('caddy', ['reload', '--config', this.config.caddyfilePath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      caddyReload.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      caddyReload.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      caddyReload.on('close', (code) => {
        if (code === 0) {
          debug(`Caddy reload successful: ${stdout}`);
          resolve();
        } else {
          error(`Caddy reload failed with code ${code}: ${stderr}`);
          reject(new Error(`Caddy reload failed: ${stderr}`));
        }
      });

      caddyReload.on('error', (err) => {
        warn(`Caddy reload command failed, trying alternative method: ${err}`);
        
        // Fallback: restart caddy if reload is not available
        try {
          execSync(`pkill -USR1 caddy`, { timeout: 5000 });
          debug('Sent USR1 signal to Caddy for graceful reload');
          resolve();
        } catch (signalErr) {
          error(`Failed to reload Caddy via signal: ${signalErr}`);
          reject(new Error(`All Caddy reload methods failed: ${err}, ${signalErr}`));
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        caddyReload.kill();
        reject(new Error('Caddy reload timed out'));
      }, 10000);
    });
  }

  /**
   * Loads existing dynamic routes from a persistent store (if implemented)
   * For now, starts with empty routes (they'll be re-added as sessions restart)
   */
  private loadExistingRoutes(): void {
    // TODO: In a production environment, we might want to persist dynamic routes
    // to a JSON file or database so they survive service restarts
    debug('Starting with empty dynamic routes (will be populated by active sessions)');
  }

  /**
   * Health check method to verify Caddy is responding
   */
  async checkCaddyHealth(): Promise<boolean> {
    try {
      const healthCheck = spawn('caddy', ['version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      return new Promise((resolve) => {
        healthCheck.on('close', (code) => {
          resolve(code === 0);
        });

        healthCheck.on('error', () => {
          resolve(false);
        });

        setTimeout(() => {
          healthCheck.kill();
          resolve(false);
        }, 3000);
      });
    } catch (err) {
      warn(`Caddy health check failed: ${err}`);
      return false;
    }
  }

  /**
   * Gets current Caddy configuration info
   */
  getCaddyInfo(): {
    caddyfilePath: string;
    projectDomain: string;
    dynamicRoutesCount: number;
    isDevelopment: boolean;
  } {
    return {
      caddyfilePath: this.config.caddyfilePath,
      projectDomain: this.config.projectDomain,
      dynamicRoutesCount: this.dynamicRoutes.size,
      isDevelopment: this.config.isDevelopment,
    };
  }

  /**
   * Generates and writes the Caddyfile without reloading Caddy
   * Useful for CLI operations that generate configurations
   */
  async generateCaddyfile(): Promise<string> {
    const content = await this.generateCaddyfileWithDynamicRoutes();
    
    // Ensure directory exists
    const caddyDir = dirname(this.config.caddyfilePath);
    if (!existsSync(caddyDir)) {
      await fs.mkdir(caddyDir, { recursive: true });
    }

    // Write new Caddyfile
    await fs.writeFile(this.config.caddyfilePath, content, 'utf8');
    info(`Caddyfile generated at: ${this.config.caddyfilePath}`);
    
    return content;
  }

  /**
   * Updates the configuration (useful for tests or environment changes)
   */
  updateConfig(newConfig: Partial<CaddyConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Preview the Caddyfile content that would be generated
   * Useful for debugging and CLI operations
   */
  async previewCaddyfile(): Promise<string> {
    try {
      const content = await this.generateCaddyfileWithDynamicRoutes();
      info('Generated Caddyfile preview:');
      console.log('--- Caddyfile Content ---');
      console.log(content);
      console.log('--- End Caddyfile ---');
      return content;
    } catch (err) {
      error(`Failed to preview Caddyfile: ${err}`);
      throw err;
    }
  }
}

// Export singleton instance with default configuration
export const caddyManager = CaddyManager.getInstance();