
import { join, resolve, basename } from "path";
import { existsSync, readdirSync, statSync } from "fs";
import { SiteConfig, createSiteConfig } from "@keithk/deploy-core";

// Default root directory for sites
const DEFAULT_ROOT_DIR = resolve(process.cwd(), "sites");

/**
 * Get all sites from the sites directory
 */
export async function getSites(rootDir?: string): Promise<SiteConfig[]> {
  const sites: SiteConfig[] = [];
  const rootPath = resolve(rootDir || process.env.ROOT_DIR || DEFAULT_ROOT_DIR);

  if (!existsSync(rootPath)) {
    console.error(`Root directory not found: ${rootPath}`);
    return sites;
  }

  const dirs = readdirSync(rootPath).filter((name) => {
    const path = join(rootPath, name);
    return statSync(path).isDirectory();
  });

  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i];
    const sitePath = join(rootPath, dir);

    // Use the centralized config loader
    const siteConfig = await createSiteConfig(sitePath, i);
    sites.push(siteConfig);
  }

  return sites;
}

/**
 * Find a site by name
 */
export async function findSiteByName(
  siteName: string,
  rootDir?: string
): Promise<SiteConfig | undefined> {
  const sites = await getSites(rootDir);
  return sites.find((site) => basename(site.path) === siteName);
}

/**
 * Format site information for display
 */
export function formatSiteInfo(site: SiteConfig): string {
  const siteName = basename(site.path);
  let output = `\n${siteName} (${site.type})`;

  if (Object.keys(site.commands || {}).length > 0) {
    output += "\n  Commands:";
    Object.entries(site.commands || {}).forEach(([name, cmd]) => {
      output += `\n    - ${name}: ${cmd}`;
    });
  } else {
    output += "\n  No commands defined";
  }

  if (site.type === "static-build" && site.buildDir) {
    output += `\n  Build directory: ${site.buildDir}`;
  }

  return output;
}

/**
 * List all sites in a formatted way
 */
export async function listSitesFormatted(rootDir?: string): Promise<string> {
  const sites = await getSites(rootDir);

  if (sites.length === 0) {
    return "No sites found.";
  }

  return sites.map(formatSiteInfo).join("");
}
