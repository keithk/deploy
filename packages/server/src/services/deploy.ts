// ABOUTME: Deployment orchestrator that coordinates the full deployment pipeline.
// ABOUTME: Handles git clone, railpack build, container start, and database status updates.

import {
  info,
  error,
  siteModel,
  logModel,
  actionModel,
  deploymentModel,
  deploymentStepModel,
  parseBuildSources,
} from "@keithk/deploy-core";
import { cloneSite } from "./git";
import { buildWithRailpacks } from "./railpacks";
import { databaseEnvVars } from "./database";
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
import { applyBuildSources } from "./overlay";
import { discoverSiteActions } from "./actions";
import type { Site } from "@keithk/deploy-core";

/** Sites currently being deployed — prevents concurrent deploys from racing on the same container */
const deployInProgress = new Set<string>();

/** Live deployment workers keyed by deployment ID so the API can cancel them. */
const deploymentAbortControllers = new Map<string, AbortController>();

const DEPLOYMENT_CANCELLED_MESSAGE = "Deployment cancelled by user";

function throwIfDeploymentCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason;
  }
}

export type CancelDeploymentResult =
  | { success: true }
  | { success: false; reason: "not_found" | "not_active"; error: string };

export interface DeployResult {
  success: boolean;
  error?: string;
  deploymentId?: string;
  imageName?: string;
  sitePath?: string;
}

interface DeployOptions {
  buildEnv?: Record<string, string>;
  imageName?: string;
  sharedBuild?: {
    imageName: string;
    sitePath: string;
  };
}

/**
 * Cancel a live deployment, or close an abandoned in-progress record.
 */
export function cancelDeployment(deploymentId: string): CancelDeploymentResult {
  const deployment = deploymentModel.findById(deploymentId);
  if (!deployment) {
    return { success: false, reason: "not_found", error: "Deployment not found" };
  }

  if (["completed", "failed", "rolled_back"].includes(deployment.status)) {
    return {
      success: false,
      reason: "not_active",
      error: "Deployment is no longer in progress",
    };
  }

  const controller = deploymentAbortControllers.get(deploymentId);
  controller?.abort(new Error(DEPLOYMENT_CANCELLED_MESSAGE));

  for (const step of deploymentStepModel.findByDeploymentId(deploymentId)) {
    if (step.status === "running") {
      deploymentStepModel.completeStep(step.id, DEPLOYMENT_CANCELLED_MESSAGE);
    }
  }
  deploymentModel.fail(deploymentId, DEPLOYMENT_CANCELLED_MESSAGE);
  logModel.append(deployment.site_id, "build", DEPLOYMENT_CANCELLED_MESSAGE);

  // A stale record has no worker left to restore the site status in its catch
  // block. Make the site deployable again while preserving a previous version.
  if (!controller) {
    const site = siteModel.findById(deployment.site_id);
    if (site?.status === "building") {
      if (deployment.old_container_id && deployment.old_port) {
        siteModel.updateStatus(
          site.id,
          "running",
          deployment.old_container_id,
          deployment.old_port
        );
      } else {
        siteModel.updateStatus(site.id, "stopped");
      }
    }
  }

  return { success: true };
}

/**
 * Deploy a site: clone/pull -> build -> start container -> update status
 * Guards against concurrent deploys of the same site (e.g. a double-click on
 * Redeploy), which otherwise race to stop/start the same container name.
 * @param siteId The ID of the site to deploy
 * @returns Result with success status, deployment ID, and optional error message
 */
export async function deploySite(
  siteId: string
): Promise<DeployResult> {
  return deploySiteWithOptions(siteId, {});
}

/** Build and deploy the source site for a group using only variables shared by every member. */
export async function deployGroupSourceSite(
  siteId: string,
  buildEnv: Record<string, string>,
  imageName: string
): Promise<DeployResult> {
  return deploySiteWithOptions(siteId, { buildEnv, imageName });
}

/** Deploy a site-specific container from an image already built for its group. */
export async function deploySiteFromImage(
  siteId: string,
  imageName: string,
  sitePath: string
): Promise<DeployResult> {
  return deploySiteWithOptions(siteId, {
    sharedBuild: { imageName, sitePath },
  });
}

async function deploySiteWithOptions(
  siteId: string,
  options: DeployOptions
): Promise<DeployResult> {
  if (deployInProgress.has(siteId)) {
    return { success: false, error: "A deployment is already in progress for this site" };
  }
  deployInProgress.add(siteId);
  const controller = new AbortController();
  try {
    return await runDeploy(siteId, controller, options);
  } finally {
    deployInProgress.delete(siteId);
  }
}

async function runDeploy(
  siteId: string,
  controller: AbortController,
  options: DeployOptions
): Promise<DeployResult> {
  let site: Site | null;
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

  if (site.type === "compose" && !options.sharedBuild) {
    return deployComposeSite(site, controller);
  }

  if (site.type === "compose") {
    return { success: false, error: "Compose sites cannot use a shared build image" };
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
  let containerInfo: Awaited<ReturnType<typeof startContainer>> | null = null;
  let blueGreenSwitched = false;
  const { signal } = controller;

  try {
    // Create a deployment record to track progress
    deployment = deploymentModel.create({
      site_id: siteId,
      old_container_id: site.container_id,
      old_port: site.port,
    });
    deploymentAbortControllers.set(deployment.id, controller);
    throwIfDeploymentCancelled(signal);
    // Only update status to building if there's NO existing container
    // For blue-green deploys, keep status as "running" so routing continues to work
    if (!hasExistingContainer) {
      siteModel.updateStatus(siteId, "building");
    }

    const envVars = { ...parseEnvVars(site.env_vars), ...databaseEnvVars(site) };
    let sitePath: string;
    let imageName: string;

    if (options.sharedBuild) {
      sitePath = options.sharedBuild.sitePath;
      imageName = options.sharedBuild.imageName;
      currentStepId = deploymentStepModel.startStep(deployment.id, "build").id;
      deploymentModel.updateStatus(deployment.id, "building");
      log(`Using shared group image ${imageName}`);
      throwIfDeploymentCancelled(signal);
      deploymentStepModel.completeStep(currentStepId);
      currentStepId = null;
    } else {
      // Step 1: Clone or pull the repository
      if (!site.git_url) {
        throw new Error(`Site ${site.name} has no git_url to clone`);
      }
      currentStepId = deploymentStepModel.startStep(deployment.id, "clone").id;
      deploymentModel.updateStatus(deployment.id, "cloning");
      log(`Cloning repository from ${site.git_url}...`);
      sitePath = await cloneSite(site.git_url, site.name, site.branch);
      throwIfDeploymentCancelled(signal);
      log(`Repository cloned to ${sitePath}`);
      deploymentStepModel.completeStep(currentStepId);
      currentStepId = null;

      // Step 2: Overlay build sources (private plugins, licensed assets) onto the checkout
      const buildSources = parseBuildSources(site);
      if (buildSources.length) {
        currentStepId = deploymentStepModel.startStep(deployment.id, "overlay").id;
        log(`Adding ${buildSources.length} build source(s) to the build context...`);
        await applyBuildSources(sitePath, buildSources, log);
        throwIfDeploymentCancelled(signal);
        deploymentStepModel.completeStep(currentStepId);
        currentStepId = null;
      }

      // Step 3: Build with Railpack. A normal site deploy exposes all site variables;
      // a group source deploy supplies only variables shared by every member.
      currentStepId = deploymentStepModel.startStep(deployment.id, "build").id;
      deploymentModel.updateStatus(deployment.id, "building");
      log(`Building with Railpack...`);
      const buildResult = await buildWithRailpacks(sitePath, site.name, {
        signal,
        buildEnv: options.buildEnv ?? envVars,
        imageName: options.imageName,
      });
      throwIfDeploymentCancelled(signal);
      if (!buildResult.success) {
        throw new Error(buildResult.error || "Build failed");
      }
      imageName = buildResult.imageName;
      log(`Build complete: ${imageName}`);
      deploymentStepModel.completeStep(currentStepId);
      currentStepId = null;
    }

    // Step 4: Start the container with environment variables
    // Use blue-green deployment if there's an existing container
    currentStepId = deploymentStepModel.startStep(deployment.id, "start").id;
    deploymentModel.updateStatus(deployment.id, "starting");
    log(
      `Starting container${
        hasExistingContainer ? " (blue-green deployment)" : ""
      }...`
    );
    containerInfo = await startContainer(
      imageName,
      site.name,
      {
        envVars,
        persistentStorage: site.persistent_storage === 1,
        blueGreen: !!hasExistingContainer,
      }
    );
    throwIfDeploymentCancelled(signal);
    log(`Container started on port ${containerInfo.port}`);
    deploymentStepModel.completeStep(currentStepId);
    currentStepId = null;

    // Step 5: Wait for the new container to be healthy before switching
    currentStepId = deploymentStepModel.startStep(deployment.id, "health_check").id;
    deploymentModel.updateStatus(deployment.id, "healthy");
    log(`Waiting for container to be healthy...`);
    const containerName = containerInfo.isBlueGreen
      ? `deploy-${site.name}-new`
      : `deploy-${site.name}`;
    const isHealthy = await waitForContainerHealth(
      containerInfo.port,
      120000,
      signal
    );
    throwIfDeploymentCancelled(signal);
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

    // Step 6: Complete blue-green deployment (stop old container, rename new)
    if (containerInfo.isBlueGreen) {
      currentStepId = deploymentStepModel.startStep(deployment.id, "switch").id;
      deploymentModel.updateStatus(deployment.id, "switching");
      log(`Completing blue-green deployment...`);
      await completeBlueGreenDeployment(site.name);
      blueGreenSwitched = true;
      throwIfDeploymentCancelled(signal);
      deploymentStepModel.completeStep(currentStepId);
      currentStepId = null;
    }

    // Step 7: Update status to running with new container info
    siteModel.updateStatus(
      siteId,
      "running",
      containerInfo.containerId,
      containerInfo.port
    );
    siteModel.markDeployed(siteId);

    // Step 8: Discover and register actions from the site
    currentStepId = deploymentStepModel.startStep(
      deployment.id,
      "register_actions"
    ).id;
    log(`Discovering actions...`);
    const actions = await discoverSiteActions(sitePath, siteId);
    throwIfDeploymentCancelled(signal);
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
    throwIfDeploymentCancelled(signal);
    deploymentModel.complete(
      deployment.id,
      containerInfo.containerId,
      containerInfo.port
    );

    log(`Deployment complete!`);
    return {
      success: true,
      deploymentId: deployment.id,
      imageName,
      sitePath,
    };
  } catch (err) {
    const cancelled = signal.aborted;
    const message = cancelled
      ? DEPLOYMENT_CANCELLED_MESSAGE
      : err instanceof Error
        ? err.message
        : String(err);
    error(`Deployment failed for ${site.name}: ${message}`);
    logModel.append(siteId, "build", `ERROR: ${message}`);

    if (cancelled && containerInfo) {
      if (containerInfo.isBlueGreen) {
        if (blueGreenSwitched) {
          await stopContainer(site.name);
        } else {
          await rollbackBlueGreenDeployment(site.name);
        }
      } else {
        await stopContainer(site.name);
      }
    }

    // Close the active step (if any) as failed.
    if (currentStepId) {
      deploymentStepModel.completeStep(currentStepId, message);
    }

    // Mark deployment as failed (if we managed to create one)
    if (deployment) {
      deploymentModel.fail(deployment.id, message);
    }

    // Preserve the old container unless a completed blue-green switch already
    // replaced it; in that case cancellation leaves the site stopped.
    if (!hasExistingContainer || (cancelled && blueGreenSwitched)) {
      siteModel.updateStatus(siteId, cancelled ? "stopped" : "error");
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
  } finally {
    if (deployment) {
      deploymentAbortControllers.delete(deployment.id);
    }
  }
}

/**
 * Stop a running site (full container removal — caller redeploys to bring it back).
 */
export async function stopSite(siteId: string): Promise<void> {
  let site: Site | null;
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
  site: Site,
  controller: AbortController
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
  let composeStartAttempted = false;
  const wasRunning = site.status === "running";
  const { signal } = controller;

  try {
    deployment = deploymentModel.create({
      site_id: site.id,
      old_container_id: site.container_id,
      old_port: site.port,
    });
    deploymentAbortControllers.set(deployment.id, controller);
    throwIfDeploymentCancelled(signal);
    siteModel.updateStatus(site.id, "building");

    // Step 1: prepare — write compose.yml
    currentStepId = deploymentStepModel.startStep(deployment.id, "prepare").id;
    deploymentModel.updateStatus(deployment.id, "starting");
    // Use the shared port allocator: checks both the DB AND `docker ps` so we don't
    // collide with running containers from other sites (the deploy-resume site bug).
    const allocatedPort = await getNextPort(site.name);
    throwIfDeploymentCancelled(signal);
    log(`Allocated host port ${allocatedPort} for primary service ${site.primary_service}`);
    log(`Writing compose project files...`);
    writeComposeProject(site, {
      allocatedPort,
      envVars: { ...parseEnvVars(site.env_vars), ...databaseEnvVars(site) },
      persistentStorage: site.persistent_storage === 1,
    });
    deploymentStepModel.completeStep(currentStepId);
    currentStepId = null;

    // Step 2: pull
    currentStepId = deploymentStepModel.startStep(deployment.id, "pull").id;
    log(`Pulling images...`);
    try {
      await pullCompose(site.name);
      throwIfDeploymentCancelled(signal);
    } catch (pullErr) {
      throwIfDeploymentCancelled(signal);
      // Warn but don't fail — service may use `build:` directives
      log(`docker compose pull warned: ${pullErr instanceof Error ? pullErr.message : String(pullErr)}`);
    }
    deploymentStepModel.completeStep(currentStepId);
    currentStepId = null;

    // Step 3: start (compose up)
    currentStepId = deploymentStepModel.startStep(deployment.id, "start").id;
    log(`Starting compose project...`);
    composeStartAttempted = true;
    await upCompose(site.name);
    throwIfDeploymentCancelled(signal);
    deploymentStepModel.completeStep(currentStepId);
    currentStepId = null;

    // Step 4: health check
    currentStepId = deploymentStepModel.startStep(deployment.id, "health_check").id;
    deploymentModel.updateStatus(deployment.id, "healthy");
    log(`Waiting for primary service to become healthy on port ${allocatedPort}...`);
    const isHealthy = await waitForContainerHealth(
      allocatedPort,
      120000,
      signal
    );
    throwIfDeploymentCancelled(signal);
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
    throwIfDeploymentCancelled(signal);
    siteModel.updateStatus(
      site.id,
      "running",
      primaryContainerId ?? undefined,
      allocatedPort
    );
    siteModel.markDeployed(site.id);

    throwIfDeploymentCancelled(signal);
    deploymentModel.complete(deployment.id, primaryContainerId ?? "", allocatedPort);

    log(`Compose deployment complete!`);
    return { success: true, deploymentId: deployment.id };
  } catch (err) {
    const cancelled = signal.aborted;
    const message = cancelled
      ? DEPLOYMENT_CANCELLED_MESSAGE
      : err instanceof Error
        ? err.message
        : String(err);
    error(`Compose deployment failed for ${site.name}: ${message}`);
    logModel.append(site.id, "build", `ERROR: ${message}`);

    if (cancelled && composeStartAttempted) {
      await downCompose(site.name, false);
    }

    if (currentStepId) {
      deploymentStepModel.completeStep(currentStepId, message);
    }
    if (deployment) {
      deploymentModel.fail(deployment.id, message);
    }
    siteModel.updateStatus(
      site.id,
      cancelled ? (wasRunning && !composeStartAttempted ? "running" : "stopped") : "error"
    );
    return { success: false, error: message, deploymentId: deployment?.id };
  } finally {
    if (deployment) {
      deploymentAbortControllers.delete(deployment.id);
    }
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
