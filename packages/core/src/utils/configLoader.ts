import { join, resolve, basename } from "path";
import { existsSync } from "fs";
import type { SiteConfig } from "../types/site";
import { debug } from "./logging";

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

  // Calculate default ports (3000 + site index)
  const basePort = 3000 + siteIndex + 1;

  console.log("site config", config);

  // Create the complete site configuration
  return {
    type,
    path: sitePath,
    route: `/${siteName}`,
    entryPoint,
    commands,
    proxyPort:
      type === "passthrough" ? config.proxyPort || basePort : undefined,
    buildDir: type === "static-build" ? config.buildDir || "dist" : undefined,
    devPort: type === "static-build" ? config.devPort || basePort : undefined,
    subdomain: config.subdomain || siteName,
    customDomain: config.customDomain,
    bskyDid: config.bskyDid,
    default: config.default === true
  };
}
