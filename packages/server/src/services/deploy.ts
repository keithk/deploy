// ABOUTME: Deployment orchestrator that coordinates the full deployment pipeline.
// ABOUTME: Handles git clone, railpack build, container start, and database status updates.

import {
  info,
  debug,
  error,
  siteModel,
  logModel,
  actionModel,
  deploymentModel,
  deploymentStepModel,
} from "@keithk/deploy-core";
import { cloneSite, pullSite, getSitePath } from "./git";
import { buildWithRailpacks } from "./railpacks";
import {
  startContainer,
  stopContainer,
  completeBlueGreenDeployment,
  rollbackBlueGreenDeployment,
  waitForContainerHealth,
  getContainerLogs,
  getNextPort,
} from "./container";
import {
  writeComposeProject,
  pullCompose,
  upCompose,
  downCompose,
  getPrimaryContainerId,
  getComposeLogs,
} from "./compose";
import { discoverSiteActions } from "./actions";
import type { Site } from "@keithk/deploy-core";

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
    const message = `Database error: ${
      err instanceof Error ? err.message : String(err)
    }`;
    error(message);
    return { success: false, error: message };
  }

  if (!site) {
    const message = `Site not found: ${siteId}`;
    error(message);
    return { success: false, error: message };
  }

  if (site.type === "compose") {
    return deployComposeSite(site);
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
  // Tracks the currently-running step row so the catch block can mark it failed.
  // We null this out the moment a step is closed (success or handled failure).
  let currentStepId: string | null = null;

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
    if (!site.git_url) {
      throw new Error(`Site ${site.name} has no git_url to clone`);
    }
    currentStepId = deploymentStepModel.startStep(deployment.id, "clone").id;
    deploymentModel.updateStatus(deployment.id, "cloning");
    log(`Cloning repository from ${site.git_url}...`);
    const sitePath = await cloneSite(site.git_url, site.name, site.branch);
    log(`Repository cloned to ${sitePath}`);
    deploymentStepModel.completeStep(currentStepId);
    currentStepId = null;

    // Step 2: Build with Railpack
    currentStepId = deploymentStepModel.startStep(deployment.id, "build").id;
    deploymentModel.updateStatus(deployment.id, "building");
    log(`Building with Railpack...`);
    const buildResult = await buildWithRailpacks(sitePath, site.name);
    if (!buildResult.success) {
      throw new Error(buildResult.error || "Build failed");
    }
    log(`Build complete: ${buildResult.imageName}`);
    deploymentStepModel.completeStep(currentStepId);
    currentStepId = null;

    // Step 3: Start the container with environment variables
    // Use blue-green deployment if there's an existing container
    currentStepId = deploymentStepModel.startStep(deployment.id, "start").id;
    deploymentModel.updateStatus(deployment.id, "starting");
    log(
      `Starting container${
        hasExistingContainer ? " (blue-green deployment)" : ""
      }...`
    );
    const envVars = parseEnvVars(site.env_vars);
    const containerInfo = await startContainer(
      buildResult.imageName,
      site.name,
      {
        envVars,
        persistentStorage: site.persistent_storage === 1,
        blueGreen: !!hasExistingContainer,
      }
    );
    log(`Container started on port ${containerInfo.port}`);
    deploymentStepModel.completeStep(currentStepId);
    currentStepId = null;

    // Step 4: Wait for the new container to be healthy before switching
    currentStepId = deploymentStepModel.startStep(deployment.id, "health_check").id;
    deploymentModel.updateStatus(deployment.id, "healthy");
    log(`Waiting for container to be healthy...`);
    const containerName = containerInfo.isBlueGreen
      ? `deploy-${site.name}-new`
      : `deploy-${site.name}`;
    const isHealthy = await waitForContainerHealth(containerInfo.port, 120000);
    if (!isHealthy) {
      // Close the health_check step now so its duration reflects time-to-failure,
      // not time-spent-on-recovery work below.
      deploymentStepModel.completeStep(
        currentStepId,
        "Container failed health check"
      );
      currentStepId = null;

      // Capture container logs to help debug the failure
      log(`Container failed health check. Capturing logs...`);
      try {
        const containerLogs = await getContainerLogs(containerName, 50);
        if (containerLogs) {
          log(`--- Container Logs ---`);
          for (const line of containerLogs.split("\n")) {
            if (line.trim()) {
              log(line);
            }
          }
          log(`--- End Container Logs ---`);
        }
      } catch (logErr) {
        log(`Could not capture container logs: ${logErr}`);
      }

      // Rollback: remove the new container and keep the old one
      if (containerInfo.isBlueGreen) {
        await rollbackBlueGreenDeployment(site.name);
        // Restore status to running since old container is still serving
        siteModel.updateStatus(
          siteId,
          "running",
          site.container_id ?? undefined,
          site.port ?? undefined
        );
        deploymentModel.update(deployment.id, {
          status: "rolled_back",
          completed_at: new Date().toISOString(),
          error_message:
            "Container failed health check - rolled back to previous version",
        });
      }
      throw new Error("Container failed health check");
    }
    log(`Container is healthy`);
    deploymentStepModel.completeStep(currentStepId);
    currentStepId = null;

    // Step 5: Complete blue-green deployment (stop old container, rename new)
    if (containerInfo.isBlueGreen) {
      currentStepId = deploymentStepModel.startStep(deployment.id, "switch").id;
      deploymentModel.updateStatus(deployment.id, "switching");
      log(`Completing blue-green deployment...`);
      await completeBlueGreenDeployment(site.name);
      deploymentStepModel.completeStep(currentStepId);
      currentStepId = null;
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
    currentStepId = deploymentStepModel.startStep(
      deployment.id,
      "register_actions"
    ).id;
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
          enabled: true,
        });
        log(`Registered action: ${action.id} (${action.type})`);
      }
    }
    deploymentStepModel.completeStep(currentStepId);
    currentStepId = null;

    // Mark deployment as completed
    deploymentModel.complete(
      deployment.id,
      containerInfo.containerId,
      containerInfo.port
    );

    log(`Deployment complete!`);
    return { success: true, deploymentId: deployment.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Deployment failed for ${site.name}: ${message}`);
    logModel.append(siteId, "build", `ERROR: ${message}`);

    // Close the active step (if any) as failed.
    if (currentStepId) {
      deploymentStepModel.completeStep(currentStepId, message);
    }

    // Mark deployment as failed (if we managed to create one)
    if (deployment) {
      deploymentModel.fail(deployment.id, message);
    }

    // Update status to error (but only if we don't have a healthy old container)
    if (!hasExistingContainer) {
      siteModel.updateStatus(siteId, "error");
    } else {
      // Restore to running if old container is still serving
      siteModel.updateStatus(
        siteId,
        "running",
        site.container_id ?? undefined,
        site.port ?? undefined
      );
      log(`Restored to previous running state`);
    }

    return { success: false, error: message, deploymentId: deployment?.id };
  }
}

/**
 * Stop a running site (full container removal — caller redeploys to bring it back).
 */
export async function stopSite(siteId: string): Promise<void> {
  let site;
  try {
    site = siteModel.findById(siteId);
  } catch (err) {
    const message = `Database error: ${
      err instanceof Error ? err.message : String(err)
    }`;
    throw new Error(message);
  }

  if (!site) {
    throw new Error(`Site not found: ${siteId}`);
  }

  info(`Stopping site: ${site.name}`);

  try {
    if (site.type === "compose") {
      // `down` (without -v) stops + removes containers, preserves volumes/data dir
      await downCompose(site.name, false);
    } else {
      await stopContainer(site.name);
    }
    siteModel.updateStatus(siteId, "stopped");
    info(`Successfully stopped site: ${site.name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to stop site ${site.name}: ${message}`);
    throw new Error(`Failed to stop site: ${message}`);
  }
}

/**
 * Deploy a compose-type site: write project files -> pull images -> up -> health check -> mark deployed.
 * No blue-green for v1 (`up -d` recreates only changed services; brief downtime acceptable).
 */
async function deployComposeSite(
  site: Site
): Promise<{ success: boolean; error?: string; deploymentId?: string }> {
  const log = (message: string) => {
    info(message);
    logModel.append(site.id, "build", message);
  };

  log(`Starting compose deployment for ${site.name}`);

  if (!site.compose_yaml || !site.primary_service || site.primary_port == null) {
    const message = `Compose site ${site.name} is missing compose_yaml/primary_service/primary_port`;
    error(message);
    logModel.append(site.id, "build", `ERROR: ${message}`);
    siteModel.updateStatus(site.id, "error");
    return { success: false, error: message };
  }

  let deployment: ReturnType<typeof deploymentModel.create> | null = null;
  let currentStepId: string | null = null;

  try {
    deployment = deploymentModel.create({
      site_id: site.id,
      old_container_id: site.container_id,
      old_port: site.port,
    });
    siteModel.updateStatus(site.id, "building");

    // Step 1: prepare — write compose.yml
    currentStepId = deploymentStepModel.startStep(deployment.id, "prepare").id;
    deploymentModel.updateStatus(deployment.id, "starting");
    // Use the shared port allocator: checks both the DB AND `docker ps` so we don't
    // collide with running containers from other sites (the deploy-resume site bug).
    const allocatedPort = await getNextPort(site.name);
    log(`Allocated host port ${allocatedPort} for primary service ${site.primary_service}`);
    log(`Writing compose project files...`);
    writeComposeProject(site, {
      allocatedPort,
      envVars: parseEnvVars(site.env_vars),
      persistentStorage: site.persistent_storage === 1,
    });
    deploymentStepModel.completeStep(currentStepId);
    currentStepId = null;

    // Step 2: pull
    currentStepId = deploymentStepModel.startStep(deployment.id, "pull").id;
    log(`Pulling images...`);
    try {
      await pullCompose(site.name);
    } catch (pullErr) {
      // Warn but don't fail — service may use `build:` directives
      log(`docker compose pull warned: ${pullErr instanceof Error ? pullErr.message : String(pullErr)}`);
    }
    deploymentStepModel.completeStep(currentStepId);
    currentStepId = null;

    // Step 3: start (compose up)
    currentStepId = deploymentStepModel.startStep(deployment.id, "start").id;
    log(`Starting compose project...`);
    await upCompose(site.name);
    deploymentStepModel.completeStep(currentStepId);
    currentStepId = null;

    // Step 4: health check
    currentStepId = deploymentStepModel.startStep(deployment.id, "health_check").id;
    deploymentModel.updateStatus(deployment.id, "healthy");
    log(`Waiting for primary service to become healthy on port ${allocatedPort}...`);
    const isHealthy = await waitForContainerHealth(allocatedPort, 120000);
    if (!isHealthy) {
      deploymentStepModel.completeStep(currentStepId, "Primary service failed health check");
      currentStepId = null;

      log(`Primary service failed health check. Capturing logs...`);
      try {
        const composeLogs = await getComposeLogs(site.name, 50);
        if (composeLogs) {
          log(`--- Compose Logs ---`);
          for (const line of composeLogs.split("\n")) {
            if (line.trim()) log(line);
          }
          log(`--- End Compose Logs ---`);
        }
      } catch (logErr) {
        log(`Could not capture compose logs: ${logErr}`);
      }

      throw new Error("Primary service failed health check");
    }
    log(`Primary service is healthy`);
    deploymentStepModel.completeStep(currentStepId);
    currentStepId = null;

    // Step 5: mark deployed — resolve primary container ID for metrics + status row
    const primaryContainerId = await getPrimaryContainerId(site.name, site.primary_service);
    siteModel.updateStatus(
      site.id,
      "running",
      primaryContainerId ?? undefined,
      allocatedPort
    );
    siteModel.markDeployed(site.id);

    deploymentModel.complete(deployment.id, primaryContainerId ?? "", allocatedPort);

    log(`Compose deployment complete!`);
    return { success: true, deploymentId: deployment.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Compose deployment failed for ${site.name}: ${message}`);
    logModel.append(site.id, "build", `ERROR: ${message}`);

    if (currentStepId) {
      deploymentStepModel.completeStep(currentStepId, message);
    }
    if (deployment) {
      deploymentModel.fail(deployment.id, message);
    }
    siteModel.updateStatus(site.id, "error");
    return { success: false, error: message, deploymentId: deployment?.id };
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
