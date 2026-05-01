// ABOUTME: Background service that samples docker stats for every running container every 5s.
// ABOUTME: Writes rows to container_metrics and prunes rows older than 7 days in the same tick.

import { $ } from "bun";
import { info, debug, error, siteModel, containerMetricModel } from "@keithk/deploy-core";
import { getPrimaryContainerName } from "./site-ops";

const POLL_INTERVAL_MS = 5_000;
const RETENTION_DAYS = 7;

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Parse "123.4MiB / 512MiB" style strings from docker stats MemUsage field.
 * Returns bytes. Returns 0 if unparseable.
 */
function parseDockerBytes(raw: string): number {
  const trimmed = raw.trim();

  // Docker reports in B, KiB, MiB, GiB, kB, MB, GB
  const match = trimmed.match(/^([\d.]+)\s*(B|kB|KiB|MB|MiB|GB|GiB)$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "b":   return Math.round(value);
    case "kb":  return Math.round(value * 1_000);
    case "kib": return Math.round(value * 1_024);
    case "mb":  return Math.round(value * 1_000_000);
    case "mib": return Math.round(value * 1_048_576);
    case "gb":  return Math.round(value * 1_000_000_000);
    case "gib": return Math.round(value * 1_073_741_824);
    default:    return 0;
  }
}

/**
 * Parse "1.23kB / 4.56MB" style string from docker stats NetIO field.
 * Returns [rxBytes, txBytes]. Returns [0, 0] if unparseable.
 */
function parseNetIO(raw: string): [number, number] {
  const parts = raw.split("/").map((s) => s.trim());
  if (parts.length !== 2) return [0, 0];
  return [parseDockerBytes(parts[0]), parseDockerBytes(parts[1])];
}

/**
 * Parse "12.34%" CPU percentage from docker stats CPUPerc field.
 * Returns 0 if unparseable.
 */
function parseCpuPct(raw: string): number {
  const match = raw.trim().match(/^([\d.]+)%$/);
  if (!match) return 0;
  return parseFloat(match[1]);
}

interface DockerStatsJson {
  CPUPerc: string;
  MemUsage: string;
  NetIO: string;
}

/**
 * Sample docker stats for a single container name.
 * Returns null if Docker is unreachable or the container is not running.
 */
export async function sampleContainer(
  containerName: string
): Promise<{ cpu_pct: number; mem_bytes: number; mem_limit_bytes: number; net_rx_bytes: number; net_tx_bytes: number } | null> {
  try {
    const raw = await $`docker stats --no-stream --format '{{json .}}' ${containerName}`.text();
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const json: DockerStatsJson = JSON.parse(trimmed);

    const cpu_pct = parseCpuPct(json.CPUPerc);

    // MemUsage is "used / limit"
    const memParts = json.MemUsage.split("/").map((s) => s.trim());
    const mem_bytes = memParts[0] ? parseDockerBytes(memParts[0]) : 0;
    const mem_limit_bytes = memParts[1] ? parseDockerBytes(memParts[1]) : 0;

    const [net_rx_bytes, net_tx_bytes] = parseNetIO(json.NetIO);

    return { cpu_pct, mem_bytes, mem_limit_bytes, net_rx_bytes, net_tx_bytes };
  } catch {
    return null;
  }
}

/**
 * One full poll + prune cycle. Exported so tests can call it directly.
 */
export async function tick(): Promise<void> {
  debug("MetricsPoller: tick");

  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let runningSites;
  try {
    runningSites = siteModel.findAll().filter((s) => s.status === "running");
  } catch (err) {
    error(`MetricsPoller: failed to query sites: ${err}`);
    return;
  }

  for (const site of runningSites) {
    let containerName: string;
    try {
      containerName = await getPrimaryContainerName(site);
    } catch (err) {
      debug(`MetricsPoller: could not resolve container name for ${site.name}: ${err}`);
      continue;
    }
    try {
      const sample = await sampleContainer(containerName);
      if (!sample) {
        debug(`MetricsPoller: no sample for ${containerName} (not running or Docker unavailable)`);
        continue;
      }

      containerMetricModel.insert({
        site_id: site.id,
        recorded_at: now,
        ...sample,
      });

      debug(`MetricsPoller: recorded metrics for ${site.name} cpu=${sample.cpu_pct.toFixed(1)}%`);
    } catch (err) {
      error(`MetricsPoller: error sampling ${containerName}: ${err}`);
      // Continue to next container — one failure must not stop the others
    }
  }

  // Prune old rows after inserting new ones
  try {
    containerMetricModel.pruneOld(cutoff);
    debug(`MetricsPoller: pruned rows before ${cutoff}`);
  } catch (err) {
    error(`MetricsPoller: failed to prune old rows: ${err}`);
  }
}

/**
 * Start the metrics poller. No-op if already running.
 */
export function startMetricsPoller(): void {
  if (intervalId !== null) {
    debug("MetricsPoller: already running");
    return;
  }

  info(`MetricsPoller: started (sampling every ${POLL_INTERVAL_MS / 1000}s, retaining ${RETENTION_DAYS} days)`);
  intervalId = setInterval(tick, POLL_INTERVAL_MS);
}

/**
 * Stop the metrics poller.
 */
export function stopMetricsPoller(): void {
  if (intervalId === null) return;
  clearInterval(intervalId);
  intervalId = null;
  info("MetricsPoller: stopped");
}
