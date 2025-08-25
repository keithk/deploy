import { join } from "path";

/**
 * Centralized path configuration for the Deploy application.
 * All generated/runtime files should be organized under the .deploy/ directory.
 */

/**
 * Get the project root directory (where the .deploy folder should be located)
 */
export function getProjectRoot(): string {
  // In most cases, this will be process.cwd(), but we can override with env var if needed
  return process.env.DEPLOY_PROJECT_ROOT || process.cwd();
}

/**
 * All Deploy application paths
 */
export const DEPLOY_PATHS = {
  // Root directories
  deployDir: join(getProjectRoot(), '.deploy'),
  
  // Database
  databaseDir: join(getProjectRoot(), '.deploy', 'database'),
  database: join(getProjectRoot(), '.deploy', 'database', 'dialup-deploy.db'),
  
  // Caddy configuration and data
  caddyDir: join(getProjectRoot(), '.deploy', 'caddy'),
  caddyfile: join(getProjectRoot(), '.deploy', 'caddy', 'Caddyfile'),
  caddyfileProduction: join(getProjectRoot(), '.deploy', 'caddy', 'Caddyfile.production'),
  caddyData: join(getProjectRoot(), '.deploy', 'caddy', 'data'),
  caddyLogs: join(getProjectRoot(), '.deploy', 'caddy', 'logs'),
  
  // SSL certificates
  sslDir: join(getProjectRoot(), '.deploy', 'ssl'),
  sslDev: join(getProjectRoot(), '.deploy', 'ssl', 'dev'),
  sslProduction: join(getProjectRoot(), '.deploy', 'ssl', 'production'),
  
  // Cache directory
  cacheDir: join(getProjectRoot(), '.deploy', 'cache'),
  buildCache: join(getProjectRoot(), '.deploy', 'cache', 'build-cache.json'),
  siteDiscoveryCache: join(getProjectRoot(), '.deploy', 'cache', 'site-discovery.json'),
  
  // Logs
  logsDir: join(getProjectRoot(), '.deploy', 'logs'),
  deployLog: join(getProjectRoot(), '.deploy', 'logs', 'deploy.log'),
  serverLog: join(getProjectRoot(), '.deploy', 'logs', 'server.log'),
  actionsLog: join(getProjectRoot(), '.deploy', 'logs', 'actions.log'),
  
  // Runtime files
  runtimeDir: join(getProjectRoot(), '.deploy', 'runtime'),
  processesState: join(getProjectRoot(), '.deploy', 'runtime', 'processes.json'),
  tempDir: join(getProjectRoot(), '.deploy', 'runtime', 'temp'),
  
  // Configuration
  rootConfig: join(getProjectRoot(), '.deploy', 'deploy.json'),
  
  // Backups
  backupsDir: join(getProjectRoot(), '.deploy', 'backups'),
} as const;

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDeployDir(dirPath: string): Promise<void> {
  try {
    await Bun.write(join(dirPath, '.gitkeep'), ''); // This will create the directory if it doesn't exist
  } catch (error) {
    // If the directory creation fails, try using mkdir
    const proc = Bun.spawn(['mkdir', '-p', dirPath], {
      stdio: ['ignore', 'ignore', 'ignore']
    });
    await proc.exited;
  }
}

/**
 * Initialize the entire .deploy directory structure
 */
export async function initializeDeployStructure(): Promise<void> {
  const directories = [
    DEPLOY_PATHS.deployDir,
    DEPLOY_PATHS.databaseDir,
    DEPLOY_PATHS.caddyDir,
    DEPLOY_PATHS.caddyData,
    DEPLOY_PATHS.caddyLogs,
    DEPLOY_PATHS.sslDir,
    DEPLOY_PATHS.sslDev,
    DEPLOY_PATHS.sslProduction,
    DEPLOY_PATHS.cacheDir,
    DEPLOY_PATHS.logsDir,
    DEPLOY_PATHS.runtimeDir,
    DEPLOY_PATHS.tempDir,
    DEPLOY_PATHS.backupsDir,
  ];

  for (const dir of directories) {
    await ensureDeployDir(dir);
  }
}

/**
 * Get SSL certificate paths for a given domain
 */
export function getSSLPaths(domain: string, isProduction = false): {
  certFile: string;
  keyFile: string;
  dir: string;
} {
  const dir = isProduction ? DEPLOY_PATHS.sslProduction : DEPLOY_PATHS.sslDev;
  return {
    dir,
    certFile: join(dir, `${domain}.crt`),
    keyFile: join(dir, `${domain}.key`),
  };
}

/**
 * Get backup directory path with timestamp
 */
export function getBackupPath(timestamp?: string): string {
  const backupTimestamp = timestamp || new Date().toISOString().replace(/[:.]/g, '-');
  return join(DEPLOY_PATHS.backupsDir, backupTimestamp);
}

/**
 * Legacy path mappings (for backwards compatibility during migration)
 */
export const LEGACY_PATHS = {
  oldDatabase: join(getProjectRoot(), 'data', 'dialup-deploy.db'),
  oldCaddyfile: join(getProjectRoot(), 'config', 'Caddyfile'),
  oldCaddyfileProduction: join(getProjectRoot(), 'Caddyfile.production'),
  oldCaddyData: join(getProjectRoot(), 'config', 'caddy-data'),
  oldSslDir: join(getProjectRoot(), 'config', 'ssl'),
  oldBuildCache: join(getProjectRoot(), '.build-cache', 'cache.json'),
  oldRootConfig: join(getProjectRoot(), 'deploy.json'),
} as const;