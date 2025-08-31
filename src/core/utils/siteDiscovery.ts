import { join, resolve } from "path";
import { existsSync, readdirSync, statSync } from "fs";
import type { SiteConfig } from "../types";
import { createSiteConfig } from "./configLoader";
import { debug, error, warn } from "./logging";
import { getBuiltInSites } from "./builtInSitesRegistry";

/**
 * Scans the root directory and identifies all site types.
 * Returns an array of SiteConfig objects for each detected site.
 *
 * @param rootDir The root directory to scan for sites
 * @param mode The server mode ('serve' or 'dev')
 * @returns An array of SiteConfig objects
 */
export async function discoverSites(
  rootDir: string,
  mode: "serve" | "dev" = "serve"
): Promise<SiteConfig[]> {
  const sites: SiteConfig[] = [];

  try {
    // Resolve the rootDir to an absolute path to handle relative paths correctly
    const absoluteRootDir = resolve(rootDir);

    // Check if the directory exists before trying to read it
    if (!existsSync(absoluteRootDir)) {
      error(`Error discovering sites: Directory not found: ${absoluteRootDir}`);
      return sites;
    }

    const dirs = readdirSync(absoluteRootDir).filter((name) => {
      const path = join(absoluteRootDir, name);

      // In serve mode, filter out directories that start with underscore
      // In dev mode, include all directories
      if (mode === "serve" && name.startsWith("_")) {
        debug(`Skipping underscore site in serve mode: ${name}`);
        return false;
      }

      return statSync(path).isDirectory();
    });

    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      if (!dir) continue;
      const sitePath = join(absoluteRootDir, dir);

      try {
        // Use the centralized config loader
        const siteConfig = await createSiteConfig(sitePath, i);
        sites.push(siteConfig);
      } catch (e) {
        error(`Error creating site config for ${dir}:`, e);
      }
    }

    // Add built-in sites (like admin panel)
    try {
      const builtInSites = getBuiltInSites();
      sites.push(...builtInSites);
      debug(`Discovered ${builtInSites.length} built-in sites`);
    } catch (e) {
      warn("Error discovering built-in sites:", e);
    }

  } catch (err) {
    error("Error discovering sites:", err);
  }

  return sites;
}

