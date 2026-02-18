// ABOUTME: Docker container management for deployed sites.
// ABOUTME: Handles starting, stopping, and monitoring containers with port allocation.

import { $ } from "bun";
import { existsSync, mkdirSync, rmSync } from "fs";
import { info, debug, error, siteModel } from "@keithk/deploy-core";

// Base path for persistent site data on host
const DATA_BASE_PATH = process.env.DEPLOY_DATA_PATH || "/var/deploy/data";

export interface ContainerInfo {
  containerId: string;
  port: number;
}

// Base port for container assignments
const BASE_PORT = parseInt(process.env.CONTAINER_BASE_PORT || "8000", 10);

/**
 * Get ports already in use by checking database and running containers
 */
async function getUsedPorts(): Promise<Set<number>> {
  const usedPorts = new Set<number>();

  // Check database for allocated ports
  try {
    const sites = siteModel.findAll();
    for (const site of sites) {
      if (site.port) {
        usedPorts.add(site.port);
      }
    }
  } catch (err) {
    debug(`Could not check database for ports: ${err}`);
  }

  // Check running docker containers
  try {
    const result = await $`docker ps --format '{{.Ports}}'`.text();
    const portMatches = result.matchAll(/(?:0\.0\.0\.0|127\.0\.0\.1):(\d+)/g);
    for (const match of portMatches) {
      usedPorts.add(parseInt(match[1], 10));
    }
  } catch (err) {
    debug(`Could not check docker for ports: ${err}`);
  }

  return usedPorts;
}

/**
 * Get the next available port for a container
 * @param siteName The site name for port lookup
 * @param forceNew If true, always allocate a new port (for blue-green deployments)
 */
async function getNextPort(
  siteName: string,
  forceNew: boolean = false
): Promise<number> {
  // Check if this site already has an allocated port in database
  if (!forceNew) {
    try {
      const existingSite = siteModel.findByName(siteName);
      if (existingSite?.port) {
        return existingSite.port;
      }
    } catch (err) {
      debug(`Could not check database for existing port: ${err}`);
    }
  }

  // Find the next available port
  const usedPorts = await getUsedPorts();
  let port = BASE_PORT;
  while (usedPorts.has(port)) {
    port++;
  }

  return port;
}

/**
 * Get the container name for a site
 */
function getContainerName(siteName: string): string {
  return `deploy-${siteName}`;
}

export interface ContainerOptions {
  envVars?: Record<string, string>;
  persistentStorage?: boolean;
  /** If true, don't stop the old container - caller is responsible for cleanup */
  blueGreen?: boolean;
}

/**
 * Get the data directory path for a site
 */
export function getSiteDataPath(siteName: string): string {
  return `${DATA_BASE_PATH}/${siteName}`;
}

/**
 * Ensure the data directory exists for a site
 */
function ensureDataDirectory(siteName: string): string {
  const dataPath = getSiteDataPath(siteName);
  if (!existsSync(dataPath)) {
    mkdirSync(dataPath, { recursive: true });
    info(`Created data directory: ${dataPath}`);
  }
  return dataPath;
}

/**
 * Remove the data directory for a site
 */
export function removeSiteDataDirectory(siteName: string): void {
  const dataPath = getSiteDataPath(siteName);
  if (existsSync(dataPath)) {
    rmSync(dataPath, { recursive: true, force: true });
    info(`Removed data directory: ${dataPath}`);
  }
}

export interface ContainerStartResult extends ContainerInfo {
  /** Container name that was started (may be temporary for blue-green) */
  containerName: string;
  /** If true, this is a blue-green deployment with old container still running */
  isBlueGreen: boolean;
}

/**
 * Start a container from an image
 * @param imageName The Docker image name to run
 * @param siteName The site name (used for container naming and port allocation)
 * @param options Container options including env vars and persistent storage
 * @returns ContainerStartResult with container ID, port, and deployment info
 */
export async function startContainer(
  imageName: string,
  siteName: string,
  options: ContainerOptions = {}
): Promise<ContainerStartResult> {
  const {
    envVars = {},
    persistentStorage = false,
    blueGreen = false,
  } = options;

  // For blue-green deployment, use a temporary container name and new port
  const containerName = blueGreen
    ? `${getContainerName(siteName)}-new`
    : getContainerName(siteName);
  const port = await getNextPort(siteName, blueGreen);

  info(`Starting container ${containerName} from ${imageName} on port ${port}`);

  // Build environment variable arguments
  const envArgs: string[] = [];
  for (const [key, value] of Object.entries(envVars)) {
    envArgs.push("-e", `${key}=${value}`);
  }

  // Always set PORT for the container
  envArgs.push("-e", `PORT=${port}`);

  // Build volume arguments if persistent storage is enabled
  const volumeArgs: string[] = [];
  if (persistentStorage) {
    const dataPath = ensureDataDirectory(siteName);
    volumeArgs.push("-v", `${dataPath}:/data`);
    envArgs.push("-e", "DATA_DIR=/data");
    info(`Persistent storage enabled: ${dataPath} -> /data`);
  }

  try {
    // For non-blue-green deployment, stop any existing container first
    if (!blueGreen) {
      await stopContainer(siteName).catch(() => {
        // Ignore errors if container doesn't exist
      });
    } else {
      // For blue-green, clean up any previous failed blue-green container
      try {
        await $`docker rm -f ${containerName}`.quiet();
      } catch {
        // Ignore if doesn't exist
      }
    }

    // Start the container
    const result = await $`docker run -d \
      --name ${containerName} \
      -p 127.0.0.1:${port}:${port} \
      --memory=512m \
      --cpus=1 \
      --restart unless-stopped \
      ${volumeArgs} \
      ${envArgs} \
      ${imageName}`.text();

    const containerId = result.trim();
    debug(`Started container ${containerId} on port ${port}`);

    return { containerId, port, containerName, isBlueGreen: blueGreen };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to start container ${containerName}: ${message}`);
    throw new Error(`Container start failed: ${message}`);
  }
}

/**
 * Complete a blue-green deployment by stopping the old container and renaming the new one
 * @param siteName The site name
 */
export async function completeBlueGreenDeployment(
  siteName: string
): Promise<void> {
  const oldContainerName = getContainerName(siteName);
  const newContainerName = `${oldContainerName}-new`;

  info(`Completing blue-green deployment for ${siteName}`);

  try {
    // Stop and remove the old container
    await stopContainer(siteName).catch(() => {
      debug(`No old container to stop for ${siteName}`);
    });

    // Rename the new container to the standard name
    // Docker doesn't have a rename for running containers that changes the name,
    // but we can use docker rename
    await $`docker rename ${newContainerName} ${oldContainerName}`.quiet();
    info(`Renamed ${newContainerName} to ${oldContainerName}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(
      `Failed to complete blue-green deployment for ${siteName}: ${message}`
    );
    throw new Error(`Blue-green completion failed: ${message}`);
  }
}

/**
 * Rollback a blue-green deployment by removing the new container
 * @param siteName The site name
 */
export async function rollbackBlueGreenDeployment(
  siteName: string
): Promise<void> {
  const newContainerName = `${getContainerName(siteName)}-new`;

  info(`Rolling back blue-green deployment for ${siteName}`);

  try {
    await $`docker stop ${newContainerName}`.quiet();
    await $`docker rm ${newContainerName}`.quiet();
    info(`Removed failed container ${newContainerName}`);
  } catch (err) {
    debug(`Rollback cleanup: ${err}`);
  }
}

/**
 * Stop and remove a container
 * @param siteName The site name
 */
export async function stopContainer(siteName: string): Promise<void> {
  const containerName = getContainerName(siteName);

  info(`Stopping container ${containerName}`);

  try {
    // Stop the container
    await $`docker stop ${containerName}`.quiet();
    debug(`Stopped container ${containerName}`);
  } catch (err) {
    // Container might not be running
    debug(`Container ${containerName} was not running`);
  }

  try {
    // Remove the container
    await $`docker rm ${containerName}`.quiet();
    debug(`Removed container ${containerName}`);
  } catch (err) {
    // Container might not exist
    debug(`Container ${containerName} did not exist`);
  }
}

/**
 * Get logs from a container
 * @param siteName The site name
 * @param lines Number of lines to retrieve (default: 100)
 * @returns Container logs as a string
 */
export async function getContainerLogs(
  siteName: string,
  lines: number = 100
): Promise<string> {
  const containerName = getContainerName(siteName);

  try {
    // Use 2>&1 to capture both stdout and stderr
    const logs =
      await $`docker logs --tail ${lines} ${containerName} 2>&1`.text();
    return logs;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to get logs for ${containerName}: ${message}`);
    throw new Error(`Failed to get container logs: ${message}`);
  }
}

/**
 * Check if a container is running
 * @param siteName The site name
 * @returns True if the container is running
 */
export async function isContainerRunning(siteName: string): Promise<boolean> {
  const containerName = getContainerName(siteName);

  try {
    const result =
      await $`docker inspect -f '{{.State.Running}}' ${containerName}`.text();
    return result.trim() === "true";
  } catch (err) {
    // Container doesn't exist
    return false;
  }
}

/**
 * Wait for a container to be healthy (responding on its port)
 * @param port The port to check
 * @param timeoutMs Maximum time to wait in milliseconds
 * @returns True if container became healthy, false if timed out
 */
export async function waitForContainerHealth(
  port: number,
  timeoutMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 1000;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}/`, {
        method: "HEAD",
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok || response.status < 500) {
        info(
          `Container on port ${port} is healthy (status: ${response.status})`
        );
        return true;
      }
    } catch {
      // Container not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  error(
    `Container on port ${port} did not become healthy within ${timeoutMs}ms`
  );
  return false;
}

export interface CleanupResult {
  containersRemoved: string;
  imagesRemoved: string;
}

/**
 * Remove stopped containers older than 24 hours and dangling images
 */
export async function cleanupContainers(): Promise<CleanupResult> {
  let containersRemoved = "";
  let imagesRemoved = "";

  try {
    containersRemoved =
      await $`docker container prune -f --filter "until=24h"`.text();
    info(`Container cleanup: ${containersRemoved.trim()}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to prune containers: ${message}`);
    containersRemoved = `Error: ${message}`;
  }

  try {
    imagesRemoved = await $`docker image prune -f`.text();
    info(`Image cleanup: ${imagesRemoved.trim()}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to prune images: ${message}`);
    imagesRemoved = `Error: ${message}`;
  }

  return {
    containersRemoved: containersRemoved.trim(),
    imagesRemoved: imagesRemoved.trim(),
  };
}

/**
 * Remove old blue-green deployment containers for a specific site
 */
export async function cleanupSiteContainers(siteName: string): Promise<void> {
  const blueGreenName = `${getContainerName(siteName)}-new`;

  try {
    await $`docker rm -f ${blueGreenName}`.quiet();
    info(`Removed old blue-green container: ${blueGreenName}`);
  } catch {
    // No leftover blue-green container — nothing to do
    debug(`No blue-green container to clean up for ${siteName}`);
  }
}
