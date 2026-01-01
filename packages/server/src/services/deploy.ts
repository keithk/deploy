// ABOUTME: Deployment orchestrator that coordinates the full deployment pipeline.
// ABOUTME: Handles git clone, railpack build, container start, and database status updates.

import { info, debug, error, siteModel, logModel, actionModel } from "@keithk/deploy-core";
import { cloneSite, pullSite, getSitePath } from "./git";
import { buildWithRailpacks } from "./railpacks";
import { startContainer, stopContainer } from "./container";
import { discoverSiteActions } from "./actions";

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

  // Helper to log to both console and database
  const log = (message: string) => {
    info(message);
    logModel.append(siteId, "build", message);
  };

  log(`Starting deployment for ${site.name}`);

  try {
    // Update status to building
    siteModel.updateStatus(siteId, "building");

    // Step 1: Clone or pull the repository
    log(`Cloning repository from ${site.git_url}...`);
    const sitePath = await cloneSite(site.git_url, site.name, site.branch);
    log(`Repository cloned to ${sitePath}`);

    // Step 2: Build with Railpack
    log(`Building with Railpack...`);
    const buildResult = await buildWithRailpacks(sitePath, site.name);
    if (!buildResult.success) {
      throw new Error(buildResult.error || "Build failed");
    }
    log(`Build complete: ${buildResult.imageName}`);

    // Step 3: Start the container with environment variables
    log(`Starting container...`);
    const envVars = parseEnvVars(site.env_vars);
    const containerInfo = await startContainer(
      buildResult.imageName,
      site.name,
      envVars
    );
    log(`Container started on port ${containerInfo.port}`);

    // Step 4: Update status to running with container info
    siteModel.updateStatus(
      siteId,
      "running",
      containerInfo.containerId,
      containerInfo.port
    );
    siteModel.markDeployed(siteId);

    // Step 5: Discover and register actions from the site
    log(`Discovering actions...`);
    const actions = await discoverSiteActions(sitePath, siteId);
    if (actions.length > 0) {
      // Clear old actions for this site first
      actionModel.deleteBySiteId(siteId);
      // Register new actions
      for (const action of actions) {
        actionModel.upsert({
          id: action.id,
          name: action.name || action.id,
          type: action.type,
          site_id: siteId,
          entry_path: action.entryPath,
          enabled: true
        });
        log(`Registered action: ${action.id} (${action.type})`);
      }
    }

    log(`Deployment complete!`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Deployment failed for ${site.name}: ${message}`);
    logModel.append(siteId, "build", `ERROR: ${message}`);

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
