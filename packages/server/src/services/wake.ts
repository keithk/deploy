// ABOUTME: Wakes sleeping sites by starting their stopped Docker containers.
// ABOUTME: Guards against duplicate wake attempts with an in-memory set.

import { info, error, siteModel } from "@keithk/deploy-core";
import { waitForContainerHealth } from "./container";
import { startSiteContainer, stopSiteContainer } from "./site-ops";

/** Sites currently being woken — prevents duplicate wake calls */
const wakeInProgress = new Set<string>();

/**
 * Wake a sleeping site by starting its existing Docker container.
 * Guards against concurrent wake attempts for the same site.
 */
export async function wakeSite(siteId: string): Promise<void> {
  if (wakeInProgress.has(siteId)) {
    return;
  }

  const site = siteModel.findById(siteId);
  if (!site || site.status !== "sleeping") {
    return;
  }

  wakeInProgress.add(siteId);
  const startTime = Date.now();

  try {
    await startSiteContainer(site);

    if (!site.port) {
      error(`Site ${site.name} has no port assigned, cannot health-check`);
      siteModel.updateStatus(siteId, "error");
      return;
    }

    const healthy = await waitForContainerHealth(site.port, 30000);

    if (healthy) {
      siteModel.updateStatus(siteId, "running", site.container_id ?? undefined, site.port);
      const duration = Date.now() - startTime;
      info(`Site ${site.name} woke in ${duration}ms`);
    } else {
      // A slow health check is usually transient (a busy host, a slow app boot).
      // Go back to sleep rather than "error" so the next visit retries the wake.
      error(`Site ${site.name} failed to become healthy after wake; returning it to sleep`);
      await stopSiteContainer(site);
      siteModel.updateStatus(siteId, "sleeping", site.container_id ?? undefined, site.port);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to wake site ${site.name}: ${message}`);
    siteModel.updateStatus(siteId, "error");
  } finally {
    wakeInProgress.delete(siteId);
  }
}
