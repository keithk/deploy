import { join, resolve, basename } from "path";
import { existsSync } from "fs";
import type { SiteConfig } from "../types/site";
import { debug, warn } from "./logging";
import { findAvailablePort, getPortConfig, isValidPort } from "./portUtils";

/**
 * Loads configuration for a site from .dialup/config.json or config.json
 *
 * @param sitePath Path to the site directory
 * @returns The site configuration
 */
export async function loadSiteConfig(
  sitePath: string
): Promise<Partial<SiteConfig>> {
  // First try the new location (.dialup/config.json)
  const newConfigPath = join(sitePath, ".dialup", "config.json");

  if (existsSync(newConfigPath)) {
    try {
      debug(`Loading config from new location: ${newConfigPath}`);
      const configContent = await Bun.file(newConfigPath).text();
      return JSON.parse(configContent);
    } catch (e) {
      console.error(`Error reading config from ${newConfigPath}:`, e);
    }
  }

  // Fall back to the old location (config.json)
  const oldConfigPath = join(sitePath, "config.json");

  if (existsSync(oldConfigPath)) {
    try {
      debug(`Loading config from legacy location: ${oldConfigPath}`);
      const configContent = await Bun.file(oldConfigPath).text();
      return JSON.parse(configContent);
    } catch (e) {
      console.error(`Error reading config from ${oldConfigPath}:`, e);
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
 * @returns The determined site type
 */
export function determineSiteType(
  config: Partial<SiteConfig>,
  packageJson: Record<string, any> | null,
  hasIndexJs: boolean
): SiteConfig["type"] {
  // Use explicit type from config if available
  if (config.type) {
    return config.type;
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

  // Determine site type
  const type = determineSiteType(config, packageJson, hasIndexJs);

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
    default: config.default === true
  };
}
