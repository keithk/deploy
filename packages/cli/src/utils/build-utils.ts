
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
 * Build a Docker site by creating a Docker image
 */
async function buildDockerSite(site: SiteConfig): Promise<boolean> {
  // Import Docker handler dynamically to avoid circular dependencies
  const { DockerSiteHandler } = await import("../../../server/src/handlers/dockerSiteHandler");
  
  const handler = new DockerSiteHandler(site, "serve");
  return handler.buildImage();
}

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
  const buildableSites = sites.filter((site) => 
    site.type === "static-build" || site.type === "docker"
  );

  if (buildableSites.length === 0) {
    return {
      success: true,
      message: "No static-build or docker sites found.",
      builtSites: [],
      failedSites: []
    };
  }

  // Load the build cache
  const buildCache = loadBuildCache();

  // Count how many sites need to be built
  const sitesToBuild = buildableSites.filter(
    (site) => {
      // For static-build sites, check if they have build command and need rebuild
      if (site.type === "static-build") {
        return site.commands && site.commands.build && needsRebuild(site, buildCache);
      }
      // For docker sites, always consider them buildable
      if (site.type === "docker") {
        return true;
      }
      return false;
    }
  );

  if (sitesToBuild.length === 0) {
    return {
      success: true,
      message: "All sites are up to date. No builds needed.",
      builtSites: [],
      failedSites: []
    };
  }

  console.log(`Building ${sitesToBuild.length} sites...`);

  const builtSites: string[] = [];
  const failedSites: string[] = [];

  for (const site of sitesToBuild) {
    const siteName = basename(site.path);
    console.log(`\nBuilding ${siteName} (${site.type})...`);

    let buildSuccess = false;

    if (site.type === "static-build" && site.commands && site.commands.build) {
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
      buildSuccess = result.success;

      if (!buildSuccess) {
        console.error(
          `Build for site "${siteName}" failed with exit code ${result.status}`
        );
      }
    } else if (site.type === "docker") {
      // Build Docker image
      try {
        buildSuccess = await buildDockerSite(site);
      } catch (error) {
        console.error(`Docker build for site "${siteName}" failed:`, error);
        buildSuccess = false;
      }
    }

    if (buildSuccess) {
      console.log(`Successfully built ${siteName}`);
      // Update the build cache
      updateBuildCache(site, buildCache);
      builtSites.push(siteName);
    } else {
      failedSites.push(siteName);
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

  if (site.type !== "static-build" && site.type !== "docker") {
    return {
      success: false,
      message: `Site "${siteName}" is not a buildable site type (${site.type}).`
    };
  }

  console.log(`Building ${siteName} (${site.type})...`);

  let buildSuccess = false;

  if (site.type === "static-build") {
    if (!site.commands || !site.commands.build) {
      return {
        success: false,
        message: `Site "${siteName}" does not have a build command.`
      };
    }

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
    buildSuccess = result.success;

    if (!buildSuccess) {
      return {
        success: false,
        message: `Build for site "${siteName}" failed with exit code ${result.status}`
      };
    }
  } else if (site.type === "docker") {
    // Build Docker image
    try {
      buildSuccess = await buildDockerSite(site);
      if (!buildSuccess) {
        return {
          success: false,
          message: `Docker build for site "${siteName}" failed.`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Docker build for site "${siteName}" failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // Update the build cache
  const buildCache = loadBuildCache();
  updateBuildCache(site, buildCache);

  return {
    success: true,
    message: `Successfully built ${siteName}`
  };
}
