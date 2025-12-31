// ABOUTME: Deployment orchestrator that coordinates the full deployment pipeline.
// ABOUTME: Handles git clone, railpack build, container start, and database status updates.

import { info, debug, error, siteModel } from "@keithk/deploy-core";
import { cloneSite, pullSite, getSitePath } from "./git";
import { buildWithRailpacks } from "./railpacks";
import { startContainer, stopContainer } from "./container";

/**
 * Deploy a site: clone/pull -> build -> start container -> update status
 * @param siteId The ID of the site to deploy
 * @returns Result with success status and optional error message
 */
export async function deploySite(
  siteId: string
): Promise<{ success: boolean; error?: string }> {
  let site;
  try {
    site = siteModel.findById(siteId);
  } catch (err) {
    const message = `Database error: ${err instanceof Error ? err.message : String(err)}`;
    error(message);
    return { success: false, error: message };
  }

  if (!site) {
    const message = `Site not found: ${siteId}`;
    error(message);
    return { success: false, error: message };
  }

  info(`Starting deployment for site: ${site.name}`);

  try {
    // Update status to building
    siteModel.updateStatus(siteId, "building");

    // Step 1: Clone or pull the repository
    debug(`Cloning/pulling repository for ${site.name}`);
    const sitePath = await cloneSite(site.git_url, site.name, site.branch);

    // Step 2: Build with Railpack
    debug(`Building ${site.name} with Railpack`);
    const buildResult = await buildWithRailpacks(sitePath, site.name);
    if (!buildResult.success) {
      throw new Error(buildResult.error || "Build failed");
    }

    // Step 3: Start the container with environment variables
    debug(`Starting container for ${site.name}`);
    const envVars = parseEnvVars(site.env_vars);
    const containerInfo = await startContainer(
      buildResult.imageName,
      site.name,
      envVars
    );

    // Step 4: Update status to running with container info
    siteModel.updateStatus(
      siteId,
      "running",
      containerInfo.containerId,
      containerInfo.port
    );
    siteModel.markDeployed(siteId);

    info(`Successfully deployed site: ${site.name} on port ${containerInfo.port}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Deployment failed for ${site.name}: ${message}`);

    // Update status to error
    siteModel.updateStatus(siteId, "error");

    return { success: false, error: message };
  }
}

/**
 * Stop a running site
 * @param siteId The ID of the site to stop
 */
export async function stopSite(siteId: string): Promise<void> {
  let site;
  try {
    site = siteModel.findById(siteId);
  } catch (err) {
    const message = `Database error: ${err instanceof Error ? err.message : String(err)}`;
    throw new Error(message);
  }

  if (!site) {
    throw new Error(`Site not found: ${siteId}`);
  }

  info(`Stopping site: ${site.name}`);

  try {
    await stopContainer(site.name);
    siteModel.updateStatus(siteId, "stopped");
    info(`Successfully stopped site: ${site.name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to stop site ${site.name}: ${message}`);
    throw new Error(`Failed to stop site: ${message}`);
  }
}

/**
 * Parse environment variables from JSON string
 */
function parseEnvVars(envVarsJson: string): Record<string, string> {
  try {
    const parsed = JSON.parse(envVarsJson);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}
