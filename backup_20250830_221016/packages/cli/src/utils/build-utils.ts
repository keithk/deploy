
import { basename } from "path";
import {
  SiteConfig,
  loadBuildCache,
  needsRebuild,
  updateBuildCache
} from "@keithk/deploy-core";
import { ensureNodeModules } from "./package-manager";
import { getSites } from "./site-manager";
import { runPackageManagerCommand } from "./package-manager";

/**
 * Build all static-build sites
 */
export async function buildAllSites(rootDir?: string): Promise<{
  success: boolean;
  message: string;
  builtSites: string[];
  failedSites: string[];
}> {
  const sites = await getSites(rootDir);
  const staticBuildSites = sites.filter((site) => site.type === "static-build");

  if (staticBuildSites.length === 0) {
    return {
      success: true,
      message: "No static-build sites found.",
      builtSites: [],
      failedSites: []
    };
  }

  // Load the build cache
  const buildCache = loadBuildCache();

  // Count how many sites need to be built
  const sitesToBuild = staticBuildSites.filter(
    (site) =>
      site.commands && site.commands.build && needsRebuild(site, buildCache)
  );

  if (sitesToBuild.length === 0) {
    return {
      success: true,
      message: "All sites are up to date. No builds needed.",
      builtSites: [],
      failedSites: []
    };
  }

  console.log(`Building ${sitesToBuild.length} static-build sites...`);

  const builtSites: string[] = [];
  const failedSites: string[] = [];

  for (const site of sitesToBuild) {
    if (site.commands && site.commands.build) {
      const siteName = basename(site.path);
      console.log(`\nBuilding ${siteName}...`);

      // Ensure node_modules are installed
      const dependenciesInstalled = await ensureNodeModules(site.path);
      if (!dependenciesInstalled) {
        console.warn(
          `Skipping build for ${siteName} due to dependency installation failure.`
        );
        failedSites.push(siteName);
        continue;
      }

      // Run the build command
      const result = runPackageManagerCommand(site.path, "build");

      if (!result.success) {
        console.error(
          `Build for site "${siteName}" failed with exit code ${result.status}`
        );
        failedSites.push(siteName);
      } else {
        console.log(`Successfully built ${siteName}`);
        // Update the build cache
        updateBuildCache(site, buildCache);
        builtSites.push(siteName);
      }
    }
  }

  return {
    success: failedSites.length === 0,
    message: `Build process completed. ${builtSites.length} sites built successfully, ${failedSites.length} sites failed.`,
    builtSites,
    failedSites
  };
}

/**
 * Build a specific site
 */
export async function buildSite(
  siteName: string,
  rootDir?: string
): Promise<{
  success: boolean;
  message: string;
}> {
  const sites = await getSites(rootDir);
  const site = sites.find((s) => basename(s.path) === siteName);

  if (!site) {
    return {
      success: false,
      message: `Site "${siteName}" not found.`
    };
  }

  if (site.type !== "static-build") {
    return {
      success: false,
      message: `Site "${siteName}" is not a static-build site.`
    };
  }

  if (!site.commands || !site.commands.build) {
    return {
      success: false,
      message: `Site "${siteName}" does not have a build command.`
    };
  }

  console.log(`Building ${siteName}...`);

  // Ensure node_modules are installed
  const dependenciesInstalled = await ensureNodeModules(site.path);
  if (!dependenciesInstalled) {
    return {
      success: false,
      message: `Failed to install dependencies for ${siteName}.`
    };
  }

  // Run the build command
  const result = runPackageManagerCommand(site.path, "build");

  if (!result.success) {
    return {
      success: false,
      message: `Build for site "${siteName}" failed with exit code ${result.status}`
    };
  }

  // Update the build cache
  const buildCache = loadBuildCache();
  updateBuildCache(site, buildCache);

  return {
    success: true,
    message: `Successfully built ${siteName}`
  };
}
