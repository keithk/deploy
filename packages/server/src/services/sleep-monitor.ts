// ABOUTME: Background service that monitors idle sites and puts them to sleep.
// ABOUTME: Runs a 60-second interval check, stopping containers that exceed their inactivity threshold.

import { $ } from "bun";
import { info, debug, error, siteModel } from "@keithk/deploy-core";

const CHECK_INTERVAL_MS = 60_000;

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Check all sleep-enabled sites and stop any that have been idle past their threshold.
 */
export async function checkForSleep(): Promise<void> {
  debug("Sleep monitor: checking for idle sites");

  // Initialize last_request_at for running sleep-enabled sites that don't have one yet
  try {
    const allSites = siteModel.findAll();
    for (const site of allSites) {
      if (site.status === "running" && site.sleep_enabled && !site.last_request_at) {
        siteModel.updateLastRequest(site.id);
        debug(`Sleep monitor: initialized last_request_at for ${site.name}`);
      }
    }
  } catch (err) {
    error(`Sleep monitor: failed to initialize timestamps: ${err}`);
  }

  // Find sites that are eligible for sleep (idle past their threshold)
  let sleepySites;
  try {
    sleepySites = siteModel.findSleepEligible();
  } catch (err) {
    error(`Sleep monitor: failed to query sleep-eligible sites: ${err}`);
    return;
  }

  for (const site of sleepySites) {
    try {
      info(`Sleep monitor: putting ${site.name} to sleep`);

      try {
        await $`docker stop deploy-${site.name}`.quiet();
        debug(`Sleep monitor: stopped container deploy-${site.name}`);
      } catch (err) {
        error(`Sleep monitor: failed to stop container deploy-${site.name}: ${err}`);
        continue;
      }

      // Update status to sleeping, preserving container_id and port for wake
      siteModel.updateStatus(
        site.id,
        "sleeping",
        site.container_id ?? undefined,
        site.port ?? undefined,
      );

      info(`Sleep monitor: ${site.name} is now sleeping`);
    } catch (err) {
      error(`Sleep monitor: error processing site ${site.name}: ${err}`);
    }
  }
}

/**
 * Start the sleep monitor interval.
 */
export function startSleepMonitor(): void {
  if (intervalId !== null) {
    debug("Sleep monitor: already running");
    return;
  }

  info("Sleep monitor: started (checking every 60s)");
  intervalId = setInterval(checkForSleep, CHECK_INTERVAL_MS);
}

/**
 * Stop the sleep monitor interval.
 */
export function stopSleepMonitor(): void {
  if (intervalId === null) {
    return;
  }

  clearInterval(intervalId);
  intervalId = null;
  info("Sleep monitor: stopped");
}
