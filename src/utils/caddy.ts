import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn, spawnSync } from 'child_process';
import { homedir } from 'os';
import { discoverSites } from "../server/discoverSites";
import type { SiteConfig } from "../types";

/**
 * Generate Caddyfile content based on domain and discovered sites
 * @param domain The primary domain for the server
 * @param sitesDir The directory containing site configurations
 * @param logger Optional logger functions for output
 * @returns The generated Caddyfile content as a string
 */
export async function generateCaddyfileContent(
  domain: string,
  sitesDir: string = "./sites",
  logger: {
    info?: (message: string) => void;
    warning?: (message: string) => void;
  } = {}
): Promise<string> {
  const log = {
    info: logger.info || console.log,
    warning: logger.warning || console.warn
  };

  log.info(`Generating Caddyfile content for domain: ${domain}...`);

  // Start with the base configuration
  let caddyfileContent = `{
  # ACME settings and port configuration
  admin 0.0.0.0:2019
  http_port 80
  https_port 443
  
  # Security headers for all sites
  servers {
    trusted_proxies static private_ranges
  }
}

# Import any additional configurations from Caddyfile.d
import Caddyfile.d/*.caddy

`;

  // Discover sites
  const sites = await discoverSites(sitesDir);
  log.info(`Found ${sites.length} sites in ${sitesDir}`);

  // Add each site configuration
  for (const site of sites) {
    if (site.type === "docker") {
      // Skip Docker sites - they should be managed separately
      log.info(`Skipping Docker site: ${site.subdomain}.${domain} (managed by container)`);
      continue;
    }

    const siteUrl = site.customDomain || `${site.subdomain}.${domain}`;
    log.info(`Adding site configuration for: ${siteUrl}`);

    // Start site block
    caddyfileContent += `# Site: ${site.path}\n`;
    caddyfileContent += `${siteUrl} {\n`;

    // Common headers for all sites
    caddyfileContent += `  header {\n`;
    caddyfileContent += `    X-Frame-Options DENY\n`;
    caddyfileContent += `    X-Content-Type-Options nosniff\n`;
    caddyfileContent += `    Referrer-Policy strict-origin-when-cross-origin\n`;
    caddyfileContent += `    X-XSS-Protection "1; mode=block"\n`;
    caddyfileContent += `    -Server\n`;
    caddyfileContent += `  }\n\n`;

    // Log configuration
    caddyfileContent += `  log {\n`;
    caddyfileContent += `    output file /var/log/caddy/${site.subdomain}_access.log\n`;
    caddyfileContent += `    format json\n`;
    caddyfileContent += `  }\n\n`;

    switch (site.type) {
      case "static":
      case "static-build":
        const publicDir = site.buildDir || "dist";
        const rootPath = join(site.path, publicDir);

        caddyfileContent += `  root * ${rootPath}\n`;
        caddyfileContent += `  encode gzip zstd\n\n`;

        // Advanced static file handling
        caddyfileContent += `  # Handle SPA routing\n`;
        caddyfileContent += `  try_files {path} {path}/ /index.html\n\n`;

        caddyfileContent += `  # Cache control for assets\n`;
        caddyfileContent += `  @assets {\n`;
        caddyfileContent += `    path *.js *.css *.png *.jpg *.jpeg *.svg *.gif *.ico *.woff *.woff2\n`;
        caddyfileContent += `  }\n`;
        caddyfileContent += `  header @assets Cache-Control "public, max-age=31536000, immutable"\n\n`;

        caddyfileContent += `  # Cache control for HTML\n`;
        caddyfileContent += `  @html {\n`;
        caddyfileContent += `    path *.html\n`;
        caddyfileContent += `  }\n`;
        caddyfileContent += `  header @html Cache-Control "no-cache, no-store, must-revalidate"\n\n`;

        caddyfileContent += `  file_server\n`;
        break;

      case "dynamic":
      case "passthrough":
        const port = site.proxyPort || site.devPort || 3000;
        caddyfileContent += `  reverse_proxy localhost:${port} {\n`;
        caddyfileContent += `    header_up Host {host}\n`;
        caddyfileContent += `    header_up X-Real-IP {remote}\n`;
        caddyfileContent += `    header_up X-Forwarded-For {remote}\n`;
        caddyfileContent += `    header_up X-Forwarded-Proto {scheme}\n`;
        caddyfileContent += `    health_uri /health\n`;
        caddyfileContent += `    health_interval 30s\n`;
        caddyfileContent += `    health_timeout 5s\n`;
        caddyfileContent += `  }\n`;
        break;

      default:
        log.warning(`Unknown site type '${site.type}' for ${site.subdomain}`);
        caddyfileContent += `  # WARNING: Unknown site type '${site.type}'\n`;
        caddyfileContent += `  respond "Site configuration error" 500\n`;
    }

    caddyfileContent += `}\n\n`;
  }

  // Add default site that redirects to the main domain
  caddyfileContent += `# Default site - redirect to main domain\n`;
  caddyfileContent += `:80 {\n`;
  caddyfileContent += `  redir https://${domain}{uri} permanent\n`;
  caddyfileContent += `}\n\n`;

  // Add catch-all for unknown subdomains
  caddyfileContent += `# Catch-all for unknown subdomains\n`;
  caddyfileContent += `*.${domain} {\n`;
  caddyfileContent += `  respond "Site not found" 404\n`;
  caddyfileContent += `}\n`;

  return caddyfileContent;
}

/**
 * Check if Caddy is installed
 */
export async function isCaddyInstalled(): Promise<boolean> {
  try {
    const result = spawnSync('which', ['caddy']);
    return result.status === 0;
  } catch (error) {
    return false;
  }
}

/**
 * Check if Caddy is running
 */
export async function isCaddyRunning(): Promise<boolean> {
  try {
    // Try to connect to Caddy's admin API
    const response = await fetch('http://localhost:2019/config/', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }).catch(() => null);

    if (response && response.ok) {
      return true;
    }

    // Fallback: Check if process is running
    const result = spawnSync('pgrep', ['-x', 'caddy']);
    return result.status === 0;
  } catch (error) {
    return false;
  }
}

/**
 * Get the configured domain
 */
export async function getDomain(): Promise<string> {
  // Check for DIAL_UP_DOMAIN environment variable
  if (process.env.DIAL_UP_DOMAIN) {
    return process.env.DIAL_UP_DOMAIN;
  }

  // Check for domain file
  const domainFile = join(homedir(), '.dial-up', 'domain');
  if (existsSync(domainFile)) {
    const domain = readFileSync(domainFile, 'utf-8').trim();
    if (domain) {
      return domain;
    }
  }

  // Default to localhost for development
  return 'localhost';
}

/**
 * Get the Caddyfile path
 */
export function getCaddyfilePath(): string {
  const configDir = join(homedir(), '.dial-up');
  return join(configDir, 'Caddyfile');
}

/**
 * Start Caddy server
 */
export async function startCaddy(): Promise<boolean> {
  console.log('Starting Caddy server...');

  // Check if Caddy is installed
  const installed = await isCaddyInstalled();
  if (!installed) {
    console.error('Caddy is not installed. Please install Caddy first.');
    console.log('Visit https://caddyserver.com/docs/install for installation instructions.');
    return false;
  }

  // Check if already running
  const running = await isCaddyRunning();
  if (running) {
    console.log('Caddy is already running.');
    return true;
  }

  // Get domain and Caddyfile path
  const domain = await getDomain();
  const caddyfilePath = getCaddyfilePath();

  // Check if Caddyfile exists
  if (!existsSync(caddyfilePath)) {
    console.error(`Caddyfile not found at ${caddyfilePath}`);
    console.log('Run "deploy setup" to create the Caddyfile.');
    return false;
  }

  console.log(`Starting Caddy with domain: ${domain}`);
  console.log(`Using Caddyfile: ${caddyfilePath}`);

  try {
    // Start Caddy with the Caddyfile
    const caddy = spawn('caddy', ['run', '--config', caddyfilePath], {
      detached: true,
      stdio: 'ignore'
    });

    caddy.unref();

    // Wait a moment for Caddy to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if Caddy started successfully
    const isRunning = await isCaddyRunning();
    if (isRunning) {
      console.log('✅ Caddy started successfully!');
      console.log(`Your sites are available at: https://*.${domain}`);
      return true;
    } else {
      console.error('Failed to start Caddy. Check the logs for errors.');
      return false;
    }
  } catch (error) {
    console.error('Error starting Caddy:', error);
    return false;
  }
}

/**
 * Stop Caddy server
 */
export async function stopCaddy(): Promise<boolean> {
  console.log('Stopping Caddy server...');

  // Check if Caddy is running
  const running = await isCaddyRunning();
  if (!running) {
    console.log('Caddy is not running.');
    return true;
  }

  try {
    // First try to stop gracefully via admin API
    const response = await fetch('http://localhost:2019/stop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }).catch(() => null);

    if (response && response.ok) {
      console.log('✅ Caddy stopped successfully via admin API.');
      return true;
    }

    // Fallback: Kill the process
    const result = spawnSync('pkill', ['-x', 'caddy']);
    if (result.status === 0) {
      console.log('✅ Caddy stopped successfully.');
      return true;
    } else {
      console.error('Failed to stop Caddy.');
      return false;
    }
  } catch (error) {
    console.error('Error stopping Caddy:', error);
    
    // Last resort: Force kill
    try {
      spawnSync('pkill', ['-9', '-x', 'caddy']);
      console.log('✅ Caddy force stopped.');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Reload Caddy configuration
 */
export async function reloadCaddy(): Promise<boolean> {
  console.log('Reloading Caddy configuration...');

  // Check if Caddy is running
  const running = await isCaddyRunning();
  if (!running) {
    console.log('Caddy is not running. Starting Caddy...');
    return startCaddy();
  }

  const caddyfilePath = getCaddyfilePath();

  // Check if Caddyfile exists
  if (!existsSync(caddyfilePath)) {
    console.error(`Caddyfile not found at ${caddyfilePath}`);
    return false;
  }

  try {
    // Reload Caddy with the new configuration
    const result = spawnSync('caddy', ['reload', '--config', caddyfilePath]);
    
    if (result.status === 0) {
      console.log('✅ Caddy configuration reloaded successfully!');
      return true;
    } else {
      console.error('Failed to reload Caddy configuration.');
      if (result.stderr) {
        console.error('Error:', result.stderr.toString());
      }
      return false;
    }
  } catch (error) {
    console.error('Error reloading Caddy:', error);
    return false;
  }
}

/**
 * Reload Caddy in production mode
 */
export async function reloadCaddyProduction(): Promise<boolean> {
  console.log('Reloading Caddy configuration (production mode)...');

  // Check if Caddy is running
  const running = await isCaddyRunning();
  if (!running) {
    console.log('Caddy is not running. Starting Caddy in production mode...');
    return startCaddyProduction();
  }

  const caddyfilePath = getCaddyfilePath();

  // Check if Caddyfile exists
  if (!existsSync(caddyfilePath)) {
    console.error(`Caddyfile not found at ${caddyfilePath}`);
    return false;
  }

  try {
    // Reload Caddy with the new configuration using systemctl
    const result = spawnSync('sudo', ['systemctl', 'reload', 'caddy']);
    
    if (result.status === 0) {
      console.log('✅ Caddy configuration reloaded successfully (production)!');
      return true;
    } else {
      // Fallback to regular reload
      const fallbackResult = spawnSync('caddy', ['reload', '--config', caddyfilePath]);
      if (fallbackResult.status === 0) {
        console.log('✅ Caddy configuration reloaded successfully!');
        return true;
      } else {
        console.error('Failed to reload Caddy configuration.');
        return false;
      }
    }
  } catch (error) {
    console.error('Error reloading Caddy:', error);
    return false;
  }
}

/**
 * Start Caddy in production mode (using systemctl)
 */
export async function startCaddyProduction(): Promise<boolean> {
  console.log('Starting Caddy server (production mode)...');

  // Check if Caddy is installed
  const installed = await isCaddyInstalled();
  if (!installed) {
    console.error('Caddy is not installed. Please install Caddy first.');
    return false;
  }

  // Check if already running
  const running = await isCaddyRunning();
  if (running) {
    console.log('Caddy is already running.');
    return true;
  }

  try {
    // Try to start Caddy using systemctl
    const result = spawnSync('sudo', ['systemctl', 'start', 'caddy']);
    
    if (result.status === 0) {
      // Wait a moment for Caddy to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if Caddy started successfully
      const isRunning = await isCaddyRunning();
      if (isRunning) {
        console.log('✅ Caddy started successfully (production mode)!');
        return true;
      }
    }
    
    // Fallback to regular start
    console.log('Falling back to regular Caddy start...');
    return startCaddy();
  } catch (error) {
    console.error('Error starting Caddy in production mode:', error);
    return startCaddy();
  }
}