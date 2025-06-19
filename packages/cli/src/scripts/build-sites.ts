#!/usr/bin/env bun
// packages/cli/src/scripts/build-sites.ts

import { join, basename } from "path";
import { existsSync, readdirSync, statSync } from "fs";
// Use Bun's native spawn for better performance
import {
  SiteConfig,
  loadBuildCache,
  needsRebuild,
  updateBuildCache,
  createSiteConfig
} from "@keithk/deploy-core";

const ROOT_DIR = process.env.ROOT_DIR || "./sites";

/**
 * Get all sites
 */
async function getSites(): Promise<SiteConfig[]> {
  const sites: SiteConfig[] = [];
  const rootPath = ROOT_DIR;

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

    try {
      // Use the centralized config loader
      const siteConfig = await createSiteConfig(sitePath, i);
      sites.push(siteConfig);
    } catch (e) {
      console.error(`Error creating site config for ${dir}:`, e);
    }
  }

  return sites;
}

/**
 * Check if node_modules exists and install dependencies if needed
 */
async function ensureNodeModules(
  sitePath: string,
  packageManager: string
): Promise<boolean> {
  const nodeModulesPath = join(sitePath, "node_modules");
  const packageJsonPath = join(sitePath, "package.json");

  // Check if package.json exists
  if (!existsSync(packageJsonPath)) {
    return true; // No package.json, so no dependencies to install
  }

  // Check if node_modules exists
  if (existsSync(nodeModulesPath)) {
    // Check if it's not empty
    try {
      const files = readdirSync(nodeModulesPath);
      if (files.length > 0) {
        return true; // node_modules exists and is not empty
      }
    } catch (error) {
      console.warn(
        `Could not read node_modules directory: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Need to install dependencies
  console.log(`Installing dependencies for site at ${sitePath}...`);

  // Define install command based on package manager (it's always "install" for all package managers)
  const installCommand = "install";

  try {
    // Use Bun.spawnSync for better performance
    const result = Bun.spawnSync([packageManager, installCommand], {
      cwd: sitePath,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
      env: process.env
    });

    if (result.exitCode !== 0) {
      console.error(
        `Dependency installation failed with exit code ${result.exitCode}`
      );
      return false;
    }

    console.log(`Dependencies installed successfully.`);
    return true;
  } catch (error) {
    console.error(
      `Error installing dependencies: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

/**
 * Build all static-build sites
 */
async function buildAll() {
  const sites = await getSites();
  const staticBuildSites = sites.filter((site) => site.type === "static-build");

  if (staticBuildSites.length === 0) {
    console.log("No static-build sites found.");
    return;
  }

  // Load the build cache
  const buildCache = loadBuildCache();

  console.log(`Found ${staticBuildSites.length} static-build sites...`);

  // Count how many sites need to be built
  const sitesToBuild = staticBuildSites.filter(
    (site) =>
      site.commands && site.commands.build && needsRebuild(site, buildCache)
  );

  console.log(`${sitesToBuild.length} sites need to be rebuilt.`);

  if (sitesToBuild.length === 0) {
    console.log("All sites are up to date. No builds needed.");
    return;
  }

  console.log(`Building ${sitesToBuild.length} static-build sites...`);

  for (const site of staticBuildSites) {
    if (site.commands && site.commands.build) {
      const siteName = basename(site.path);

      // Check if the site needs to be rebuilt
      if (!needsRebuild(site, buildCache)) {
        console.log(`\nSkipping ${siteName} (already up to date)`);
        continue;
      }

      console.log(`\nBuilding ${siteName}...`);

      // Special-case for blog: use npm
      let packageManager = "bun";
      const blogSiteName = "blog";
      if (siteName === blogSiteName) {
        packageManager = "npm";
      } else {
        // Detect package manager by lock files
        if (existsSync(join(site.path, "bun.lock"))) {
          packageManager = "bun";
        } else if (existsSync(join(site.path, "yarn.lock"))) {
          packageManager = "yarn";
        } else if (existsSync(join(site.path, "pnpm-lock.yaml"))) {
          packageManager = "pnpm";
        } else if (existsSync(join(site.path, "package-lock.json"))) {
          packageManager = "npm";
        }
      }

      // Ensure node_modules are installed
      const dependenciesInstalled = await ensureNodeModules(
        site.path,
        packageManager
      );
      if (!dependenciesInstalled) {
        console.warn(
          `Skipping build for ${siteName} due to dependency installation failure.`
        );
        continue;
      }

      // Define command and args based on package manager
      const command =
        packageManager === "bun"
          ? "bun"
          : packageManager === "yarn"
          ? "yarn"
          : packageManager === "pnpm"
          ? "pnpm"
          : "npm";

      const args = packageManager === "yarn" ? ["build"] : ["run", "build"];

      console.log(`Using package manager: ${packageManager} to run "build"`);

      try {
        // Use Bun.spawnSync for better performance
        const result = Bun.spawnSync([command, ...args], {
          cwd: site.path,
          stdout: "inherit",
          stderr: "inherit",
          stdin: "inherit",
          env: process.env
        });

        if (result.exitCode !== 0) {
          console.error(
            `Build for site "${siteName}" failed with exit code ${result.exitCode}`
          );
        } else {
          console.log(`Successfully built ${siteName}`);
          // Update the build cache
          updateBuildCache(site, buildCache);
        }
      } catch (err) {
        console.error(`Error building site "${siteName}":`, err);
      }
    } else {
      console.log(`Skipping ${basename(site.path)} (no build command)`);
    }
  }

  console.log("\nBuild process completed.");
}

// Run the build
buildAll().catch((error) => {
  console.error(
    `Build failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
