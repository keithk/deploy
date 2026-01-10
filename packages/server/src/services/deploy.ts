// ABOUTME: Deployment orchestrator that coordinates the full deployment pipeline.
// ABOUTME: Handles git clone, railpack build, container start, and database status updates.

import { info, debug, error, siteModel, logModel, actionModel, deploymentModel } from "@keithk/deploy-core";
import { cloneSite, pullSite, getSitePath } from "./git";
import { buildWithRailpacks } from "./railpacks";
import {
  startContainer,
  stopContainer,
  completeBlueGreenDeployment,
  rollbackBlueGreenDeployment,
  waitForContainerHealth
} from "./container";
import { discoverSiteActions } from "./actions";

/**
 * Deploy a site: clone/pull -> build -> start container -> update status
 * @param siteId The ID of the site to deploy
 * @returns Result with success status, deployment ID, and optional error message
 */
export async function deploySite(
  siteId: string
): Promise<{ success: boolean; error?: string; deploymentId?: string }> {
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

  // Check if this site already has a running container (for blue-green deployment)
  const hasExistingContainer = site.status === "running" && site.container_id;

  let deployment: ReturnType<typeof deploymentModel.create> | null = null;

  try {
    // Create a deployment record to track progress
    deployment = deploymentModel.create({
      site_id: siteId,
      old_container_id: site.container_id,
      old_port: site.port,
    });
    // Only update status to building if there's NO existing container
    // For blue-green deploys, keep status as "running" so routing continues to work
    if (!hasExistingContainer) {
      siteModel.updateStatus(siteId, "building");
    }

    // Step 1: Clone or pull the repository
    deploymentModel.updateStatus(deployment.id, "cloning");
    log(`Cloning repository from ${site.git_url}...`);
    const sitePath = await cloneSite(site.git_url, site.name, site.branch);
    log(`Repository cloned to ${sitePath}`);

    // Step 2: Build with Railpack
    deploymentModel.updateStatus(deployment.id, "building");
    log(`Building with Railpack...`);
    const buildResult = await buildWithRailpacks(sitePath, site.name);
    if (!buildResult.success) {
      throw new Error(buildResult.error || "Build failed");
    }
    log(`Build complete: ${buildResult.imageName}`);

    // Step 3: Start the container with environment variables
    // Use blue-green deployment if there's an existing container
    deploymentModel.updateStatus(deployment.id, "starting");
    log(`Starting container${hasExistingContainer ? " (blue-green deployment)" : ""}...`);
    const envVars = parseEnvVars(site.env_vars);
    const containerInfo = await startContainer(
      buildResult.imageName,
      site.name,
      {
        envVars,
        persistentStorage: site.persistent_storage === 1,
        blueGreen: !!hasExistingContainer
      }
    );
    log(`Container started on port ${containerInfo.port}`);

    // Step 4: Wait for the new container to be healthy before switching
    deploymentModel.updateStatus(deployment.id, "healthy");
    log(`Waiting for container to be healthy...`);
    const isHealthy = await waitForContainerHealth(containerInfo.port);
    if (!isHealthy) {
      // Rollback: remove the new container and keep the old one
      if (containerInfo.isBlueGreen) {
        await rollbackBlueGreenDeployment(site.name);
        // Restore status to running since old container is still serving
        siteModel.updateStatus(siteId, "running", site.container_id ?? undefined, site.port ?? undefined);
        deploymentModel.update(deployment.id, {
          status: "rolled_back",
          completed_at: new Date().toISOString(),
          error_message: "Container failed health check - rolled back to previous version",
        });
      }
      throw new Error("Container failed health check");
    }
    log(`Container is healthy`);

    // Step 5: Complete blue-green deployment (stop old container, rename new)
    if (containerInfo.isBlueGreen) {
      deploymentModel.updateStatus(deployment.id, "switching");
      log(`Completing blue-green deployment...`);
      await completeBlueGreenDeployment(site.name);
    }

    // Step 6: Update status to running with new container info
    siteModel.updateStatus(
      siteId,
      "running",
      containerInfo.containerId,
      containerInfo.port
    );
    siteModel.markDeployed(siteId);

    // Step 7: Discover and register actions from the site
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

    // Mark deployment as completed
    deploymentModel.complete(deployment.id, containerInfo.containerId, containerInfo.port);

    log(`Deployment complete!`);
    return { success: true, deploymentId: deployment.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Deployment failed for ${site.name}: ${message}`);
    logModel.append(siteId, "build", `ERROR: ${message}`);

    // Mark deployment as failed (if we managed to create one)
    if (deployment) {
      deploymentModel.fail(deployment.id, message);
    }

    // Update status to error (but only if we don't have a healthy old container)
    if (!hasExistingContainer) {
      siteModel.updateStatus(siteId, "error");
    } else {
      // Restore to running if old container is still serving
      siteModel.updateStatus(siteId, "running", site.container_id ?? undefined, site.port ?? undefined);
      log(`Restored to previous running state`);
    }

    return { success: false, error: message, deploymentId: deployment?.id };
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
