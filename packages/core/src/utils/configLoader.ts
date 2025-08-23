import { join, resolve, basename } from "path";
import { existsSync } from "fs";
import type { SiteConfig } from "../types/site";
import { debug, warn } from "./logging";
import { findAvailablePort, getPortConfig, isValidPort } from "./portUtils";

/**
 * Loads configuration for a site from .deploy/config.json or deploy.json
 *
 * @param sitePath Path to the site directory
 * @returns The site configuration
 */
export async function loadSiteConfig(
  sitePath: string
): Promise<Partial<SiteConfig>> {
  // First try the preferred location (.deploy/config.json)
  const preferredConfigPath = join(sitePath, ".deploy", "config.json");

  if (existsSync(preferredConfigPath)) {
    try {
      debug(`Loading config from preferred location: ${preferredConfigPath}`);
      const configContent = await Bun.file(preferredConfigPath).text();
      return JSON.parse(configContent);
    } catch (e) {
      console.error(`Error reading config from ${preferredConfigPath}:`, e);
    }
  }

  // Fall back to the root deploy.json
  const fallbackConfigPath = join(sitePath, "deploy.json");

  if (existsSync(fallbackConfigPath)) {
    try {
      debug(`Loading config from fallback location: ${fallbackConfigPath}`);
      const configContent = await Bun.file(fallbackConfigPath).text();
      return JSON.parse(configContent);
    } catch (e) {
      console.error(`Error reading config from ${fallbackConfigPath}:`, e);
    }
  }

  debug(`No config found for ${basename(sitePath)}, using defaults`);
  return {};
}

/**
 * Loads package.json for a site if it exists
 *
 * @param sitePath Path to the site directory
 * @returns The package.json content or null if not found
 */
export async function loadPackageJson(
  sitePath: string
): Promise<Record<string, any> | null> {
  const pkgJsonPath = join(sitePath, "package.json");

  if (existsSync(pkgJsonPath)) {
    try {
      const pkgContent = await Bun.file(pkgJsonPath).text();
      return JSON.parse(pkgContent);
    } catch (e) {
      console.error(`Error reading package.json for ${basename(sitePath)}:`, e);
    }
  }

  return null;
}

/**
 * Determines the site type based on configuration and file structure
 *
 * @param config Partial site configuration
 * @param packageJson Package.json content if available
 * @param hasIndexJs Whether the site has an index.js/ts file
 * @param hasDockerfile Whether the site has a Dockerfile
 * @returns The determined site type
 */
export function determineSiteType(
  config: Partial<SiteConfig>,
  packageJson: Record<string, any> | null,
  hasIndexJs: boolean,
  hasDockerfile: boolean
): SiteConfig["type"] {
  // Use explicit type from config if available
  if (config.type) {
    return config.type;
  }

  // Check for Docker first (highest priority after explicit config)
  if (hasDockerfile) {
    return "docker";
  }

  // Determine type based on package.json and file structure
  if (packageJson?.scripts?.build) {
    return "static-build";
  } else if (packageJson?.scripts?.start) {
    return "passthrough";
  } else if (hasIndexJs || packageJson) {
    return "dynamic";
  } else {
    return "static";
  }
}

/**
 * Assigns ports for a site, checking availability and falling back if needed
 *
 * @param type The site type
 * @param config The partial site configuration
 * @param siteIndex Index of the site in the sites array
 * @param siteName The site name for logging
 * @returns Object with assigned ports
 */
async function assignSitePorts(
  type: SiteConfig["type"],
  config: Partial<SiteConfig>,
  siteIndex: number,
  siteName: string
): Promise<{ proxyPort?: number; devPort?: number }> {
  const portConfig = getPortConfig();
  const defaultPort = portConfig.basePort + siteIndex;
  
  const result: { proxyPort?: number; devPort?: number } = {};
  
  // Handle passthrough sites
  if (type === "passthrough") {
    if (config.proxyPort && isValidPort(config.proxyPort)) {
      // Use configured port if valid
      result.proxyPort = config.proxyPort;
    } else {
      // Find available port starting from default
      const availablePort = await findAvailablePort(defaultPort);
      if (availablePort !== -1) {
        result.proxyPort = availablePort;
        if (availablePort !== defaultPort) {
          debug(`Site ${siteName}: Using available port ${availablePort} instead of default ${defaultPort}`);
        }
      } else {
        warn(`Site ${siteName}: Could not find available port, using default ${defaultPort} (may conflict)`);
        result.proxyPort = defaultPort;
      }
    }
  }
  
  // Handle static-build sites in dev mode
  if (type === "static-build") {
    if (config.devPort && isValidPort(config.devPort)) {
      // Use configured port if valid
      result.devPort = config.devPort;
    } else {
      // Find available port starting from default
      const availablePort = await findAvailablePort(defaultPort);
      if (availablePort !== -1) {
        result.devPort = availablePort;
        if (availablePort !== defaultPort) {
          debug(`Site ${siteName}: Using available dev port ${availablePort} instead of default ${defaultPort}`);
        }
      } else {
        warn(`Site ${siteName}: Could not find available dev port, using default ${defaultPort} (may conflict)`);
        result.devPort = defaultPort;
      }
    }
  }
  
  // Handle docker sites
  if (type === "docker") {
    if (config.proxyPort && isValidPort(config.proxyPort)) {
      // Use configured port if valid
      result.proxyPort = config.proxyPort;
    } else {
      // Find available port starting from default
      const availablePort = await findAvailablePort(defaultPort);
      if (availablePort !== -1) {
        result.proxyPort = availablePort;
        if (availablePort !== defaultPort) {
          debug(`Site ${siteName}: Using available port ${availablePort} instead of default ${defaultPort}`);
        }
      } else {
        warn(`Site ${siteName}: Could not find available port, using default ${defaultPort} (may conflict)`);
        result.proxyPort = defaultPort;
      }
    }
  }
  
  return result;
}

/**
 * Creates a complete site configuration by merging config.json, package.json, and auto-detected values
 *
 * @param sitePath Path to the site directory
 * @param siteIndex Index of the site in the sites array (used for port calculation)
 * @returns A complete site configuration
 */
export async function createSiteConfig(
  sitePath: string,
  siteIndex: number = 0
): Promise<SiteConfig> {
  const siteName = basename(sitePath);

  // Load config.json
  const config = await loadSiteConfig(sitePath);

  // Load package.json if it exists
  const packageJson = await loadPackageJson(sitePath);

  // Check if this is a dynamic site (has index.js/ts)
  const hasIndexJs =
    existsSync(join(sitePath, "index.js")) ||
    existsSync(join(sitePath, "index.ts")) ||
    existsSync(join(sitePath, "index.mjs"));

  // Check if this is a Docker site (has Dockerfile)
  let hasDockerfile = false;
  if (existsSync(join(sitePath, "Dockerfile")) || existsSync(join(sitePath, "dockerfile"))) {
    hasDockerfile = true;
  } else if (config.docker?.dockerfile && existsSync(join(sitePath, config.docker.dockerfile))) {
    hasDockerfile = true;
  }

  // Determine site type
  const type = determineSiteType(config, packageJson, hasIndexJs, hasDockerfile);

  // Get the entry point
  const entryPoint = config.entryPoint || (hasIndexJs ? "index" : undefined);

  // Get commands from package.json if available
  const commands = config.commands || packageJson?.scripts || {};

  // Assign ports with availability checking
  const ports = await assignSitePorts(type, config, siteIndex, siteName);

  // Create the complete site configuration
  return {
    type,
    path: sitePath,
    route: `/${siteName}`,
    entryPoint,
    commands,
    proxyPort: ports.proxyPort,
    buildDir: type === "static-build" ? config.buildDir || "dist" : undefined,
    devPort: ports.devPort,
    subdomain: config.subdomain || siteName,
    customDomain: config.customDomain,
    bskyDid: config.bskyDid,
    default: config.default === true,
    docker: type === "docker" ? {
      dockerfile: config.docker?.dockerfile || "Dockerfile",
      containerPort: config.docker?.containerPort || 3000,
      environment: config.docker?.environment || {},
      volumes: config.docker?.volumes || [],
      buildArgs: config.docker?.buildArgs || {},
      imageTag: config.docker?.imageTag || siteName,
      alwaysRebuild: Boolean(config.docker?.alwaysRebuild),
      ...config.docker
    } : undefined
  };
}
