// ABOUTME: Per-site dispatcher routing runtime ops to the right backend (single container vs docker compose).
// ABOUTME: Centralizes the type-switch so sleep/wake/delete/metrics call sites stay clean.

import { $ } from "bun";
import type { Site } from "@keithk/deploy-core";
import { debug } from "@keithk/deploy-core";
import {
  stopContainer,
  getContainerLogs,
  removeSiteDataDirectory,
} from "./container";
import {
  stopCompose,
  startCompose,
  downCompose,
  getComposeLogs,
  getPrimaryContainerName as getComposePrimaryContainerName,
  removeComposeProjectDir,
} from "./compose";

function isCompose(site: Site): site is Site & { primary_service: string } {
  return site.type === "compose";
}

/**
 * Stop a site without removing it (used by sleep-monitor — preserves containers for fast wake).
 * For git-railpack sites we must NOT call `stopContainer()` here because that *removes* the
 * container; sleep needs the container to stay around. Stop only.
 */
export async function stopSiteContainer(site: Site): Promise<void> {
  if (isCompose(site)) {
    await stopCompose(site.name);
    return;
  }
  try {
    await $`docker stop deploy-${site.name}`.quiet();
    debug(`stopSiteContainer: stopped deploy-${site.name}`);
  } catch (err) {
    debug(`stopSiteContainer: docker stop deploy-${site.name} failed (may be down): ${err}`);
  }
}

/**
 * Resume a previously-stopped site (used by wake).
 */
export async function startSiteContainer(site: Site): Promise<void> {
  if (isCompose(site)) {
    await startCompose(site.name);
    return;
  }
  await $`docker start deploy-${site.name}`.quiet();
}

/**
 * Tear down everything for a site (used by site deletion). Removes containers, project dir,
 * and data dir. Does not delete the DB row — caller is responsible for that.
 */
export async function teardownSite(site: Site): Promise<void> {
  if (isCompose(site)) {
    await downCompose(site.name, true);
    removeComposeProjectDir(site.name);
    removeSiteDataDirectory(site.name);
    return;
  }
  await stopContainer(site.name);
  removeSiteDataDirectory(site.name);
}

/**
 * Read recent logs for a site.
 */
export async function getSiteLogs(site: Site, lines: number = 100): Promise<string> {
  if (isCompose(site)) {
    return getComposeLogs(site.name, lines);
  }
  return getContainerLogs(site.name, lines);
}

/**
 * Resolve the docker container name to sample metrics from.
 * For compose sites, returns the primary service container. For git-railpack, the standard name.
 */
export async function getPrimaryContainerName(site: Site): Promise<string> {
  if (isCompose(site) && site.primary_service) {
    return getComposePrimaryContainerName(site.name, site.primary_service);
  }
  return `deploy-${site.name}`;
}
