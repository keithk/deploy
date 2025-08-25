import { join, basename } from "path";
import {
  existsSync,
  statSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  readdirSync
} from "fs";
import type { SiteConfig } from "../types/site";
import { DEPLOY_PATHS, LEGACY_PATHS } from "../config/paths";

interface BuildCacheEntry {
  lastBuildTime: number;
  fileHashes: Record<string, string>;
}

interface BuildCache {
  sites: Record<string, BuildCacheEntry>;
}

// Use the new centralized paths
const CACHE_FILE = DEPLOY_PATHS.buildCache;

/**
 * Ensures the cache directory exists and handles migration from old location
 */
function ensureCacheDir(): void {
  // Create the new cache directory
  if (!existsSync(DEPLOY_PATHS.cacheDir)) {
    mkdirSync(DEPLOY_PATHS.cacheDir, { recursive: true });
  }

  // Handle migration from old location
  if (existsSync(LEGACY_PATHS.oldBuildCache) && !existsSync(CACHE_FILE)) {
    try {
      const oldContent = readFileSync(LEGACY_PATHS.oldBuildCache, "utf-8");
      writeFileSync(CACHE_FILE, oldContent);
      console.info("Build cache migrated to new location");
      
      // Clean up old file
      const fs = require('fs');
      fs.unlinkSync(LEGACY_PATHS.oldBuildCache);
      
      // Try to remove the old directory if it's empty
      try {
        fs.rmdirSync(join(process.cwd(), '.build-cache'));
      } catch (err) {
        // Ignore if directory not empty
      }
    } catch (error) {
      console.warn(`Failed to migrate build cache: ${error}`);
    }
  }
}

/**
 * Loads the build cache from disk
 */
export function loadBuildCache(): BuildCache {
  ensureCacheDir();

  if (existsSync(CACHE_FILE)) {
    try {
      const cacheContent = readFileSync(CACHE_FILE, "utf-8");
      return JSON.parse(cacheContent);
    } catch (error) {
      console.warn(
        `Error loading build cache: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return { sites: {} };
}

/**
 * Saves the build cache to disk
 */
export function saveBuildCache(cache: BuildCache): void {
  ensureCacheDir();

  try {
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.warn(
      `Error saving build cache: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Gets the last modified time of a directory recursively
 * @param dirPath Directory path to check
 * @param ignorePaths Array of paths to ignore (relative to dirPath)
 * @returns The latest modification time as a timestamp
 */
export function getDirectoryLastModified(
  dirPath: string,
  ignorePaths: string[] = []
): number {
  if (!existsSync(dirPath)) {
    return 0;
  }

  // Convert ignorePaths to absolute paths for easier comparison
  const absoluteIgnorePaths = ignorePaths.map((p) => join(dirPath, p));

  try {
    // Start with the directory's own mtime
    let latestMtime = statSync(dirPath).mtimeMs;

    // Function to recursively check files and directories
    function checkPath(path: string): void {
      // Skip if path is in ignore list
      if (
        absoluteIgnorePaths.some((ignorePath) => path.startsWith(ignorePath))
      ) {
        return;
      }

      const stats = statSync(path);

      // Update latest mtime if this file/dir is newer
      if (stats.mtimeMs > latestMtime) {
        latestMtime = stats.mtimeMs;
      }

      // If it's a directory, recurse into it
      if (stats.isDirectory()) {
        try {
          const entries = readdirSync(path);
          for (const entry of entries) {
            checkPath(join(path, entry));
          }
        } catch (error) {
          // Skip directories we can't read
          console.warn(
            `Couldn't read directory ${path}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }

    // Start the recursive check
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      checkPath(join(dirPath, entry));
    }

    return latestMtime;
  } catch (error) {
    console.warn(
      `Error checking directory ${dirPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return 0;
  }
}

/**
 * Checks if a site needs to be rebuilt
 * @param site The site configuration
 * @param cache The build cache
 * @returns true if the site needs to be rebuilt, false otherwise
 */
export function needsRebuild(site: SiteConfig, cache: BuildCache): boolean {
  const siteName = basename(site.path);
  const buildDir = join(site.path, site.buildDir || "dist");

  // If the build directory doesn't exist, we need to build
  if (!existsSync(buildDir)) {
    return true;
  }

  // If the site isn't in the cache, we need to build
  if (!cache.sites[siteName]) {
    return true;
  }

  // Get the last modified time of the site directory, ignoring the build directory
  const lastModified = getDirectoryLastModified(site.path, [
    site.buildDir || "dist",
    "node_modules"
  ]);

  // If the site has been modified since the last build, we need to build
  if (lastModified > cache.sites[siteName].lastBuildTime) {
    return true;
  }

  return false;
}

/**
 * Updates the build cache for a site
 * @param site The site configuration
 * @param cache The build cache
 */
export function updateBuildCache(site: SiteConfig, cache: BuildCache): void {
  const siteName = basename(site.path);

  cache.sites[siteName] = {
    lastBuildTime: Date.now(),
    fileHashes: {} // We're not using file hashes yet, but could be added for more granular tracking
  };

  saveBuildCache(cache);
}
