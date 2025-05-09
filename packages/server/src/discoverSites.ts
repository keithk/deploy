// Re-export discoverSites from core to maintain backward compatibility
import { discoverSites as discoverSitesCore } from "@dialup-deploy/core";

/**
 * Scans the root directory and identifies all site types.
 * Returns an array of SiteConfig objects for each detected site.
 *
 * @param rootDir The root directory to scan for sites
 * @param mode The server mode ('serve' or 'dev')
 * @returns An array of SiteConfig objects
 */
export const discoverSites = discoverSitesCore;
