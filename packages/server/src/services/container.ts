// ABOUTME: Docker container management for deployed sites.
// ABOUTME: Handles starting, stopping, and monitoring containers with port allocation.

import { $ } from "bun";
import { info, debug, error, siteModel } from "@keithk/deploy-core";

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
    const portMatches = result.matchAll(/0\.0\.0\.0:(\d+)/g);
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
 */
async function getNextPort(siteName: string): Promise<number> {
  // Check if this site already has an allocated port in database
  try {
    const existingSite = siteModel.findByName(siteName);
    if (existingSite?.port) {
      return existingSite.port;
    }
  } catch (err) {
    debug(`Could not check database for existing port: ${err}`);
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

/**
 * Start a container from an image
 * @param imageName The Docker image name to run
 * @param siteName The site name (used for container naming and port allocation)
 * @param envVars Environment variables to pass to the container
 * @returns ContainerInfo with container ID and assigned port
 */
export async function startContainer(
  imageName: string,
  siteName: string,
  envVars: Record<string, string> = {}
): Promise<ContainerInfo> {
  const containerName = getContainerName(siteName);
  const port = await getNextPort(siteName);

  info(`Starting container ${containerName} from ${imageName} on port ${port}`);

  // Build environment variable arguments
  const envArgs: string[] = [];
  for (const [key, value] of Object.entries(envVars)) {
    envArgs.push("-e", `${key}=${value}`);
  }

  // Always set PORT for the container
  envArgs.push("-e", `PORT=${port}`);

  try {
    // Stop any existing container with the same name
    await stopContainer(siteName).catch(() => {
      // Ignore errors if container doesn't exist
    });

    // Start the container
    const result = await $`docker run -d \
      --name ${containerName} \
      -p ${port}:${port} \
      ${envArgs} \
      ${imageName}`.text();

    const containerId = result.trim();
    debug(`Started container ${containerId} on port ${port}`);

    return { containerId, port };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to start container ${containerName}: ${message}`);
    throw new Error(`Container start failed: ${message}`);
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
    const logs = await $`docker logs --tail ${lines} ${containerName}`.text();
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
    const result = await $`docker inspect -f '{{.State.Running}}' ${containerName}`.text();
    return result.trim() === "true";
  } catch (err) {
    // Container doesn't exist
    return false;
  }
}
