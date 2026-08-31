// ABOUTME: Reports host-level CPU, memory, disk, load, and uptime statistics.
// ABOUTME: Keeps the existing Deploy process status fields for API compatibility.

import { statfsSync } from "node:fs";
import {
  cpus,
  freemem,
  hostname,
  loadavg,
  platform,
  release,
  totalmem,
  uptime,
} from "node:os";

interface CpuSnapshot {
  idle: number;
  total: number;
  cores: number;
}

function takeCpuSnapshot(): CpuSnapshot {
  const cpuList = cpus();
  return cpuList.reduce<CpuSnapshot>(
    (snapshot, cpu) => {
      snapshot.idle += cpu.times.idle;
      snapshot.total += Object.values(cpu.times).reduce(
        (total, value) => total + value,
        0
      );
      return snapshot;
    },
    { idle: 0, total: 0, cores: cpuList.length }
  );
}

let previousCpuSnapshot = takeCpuSnapshot();

function getCpuUsage(): { usage_pct: number; cores: number } {
  const current = takeCpuSnapshot();
  const idleDelta = current.idle - previousCpuSnapshot.idle;
  const totalDelta = current.total - previousCpuSnapshot.total;
  previousCpuSnapshot = current;

  const usage = totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0;
  return {
    usage_pct: Math.round(Math.min(100, Math.max(0, usage)) * 10) / 10,
    cores: current.cores,
  };
}

function getDiskUsage(path: string) {
  try {
    const stats = statfsSync(path);
    const totalBytes = stats.blocks * stats.bsize;
    const usedBytes = (stats.blocks - stats.bfree) * stats.bsize;
    const availableBytes = stats.bavail * stats.bsize;

    return {
      total_bytes: totalBytes,
      used_bytes: usedBytes,
      available_bytes: availableBytes,
      usage_pct:
        totalBytes > 0
          ? Math.round((usedBytes / totalBytes) * 1_000) / 10
          : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Handle GET /api/server/status.
 */
export function handleGetServerStatus(storagePath: string): Response {
  try {
    const cpu = getCpuUsage();
    const totalMemory = totalmem();
    const availableMemory = freemem();
    const usedMemory = totalMemory - availableMemory;

    return Response.json({
      status: "running",
      recorded_at: new Date().toISOString(),

      // Legacy Deploy process fields.
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,

      host: {
        hostname: hostname(),
        platform: platform(),
        release: release(),
        uptime_seconds: uptime(),
        cpu: {
          ...cpu,
          load_average: loadavg(),
        },
        memory: {
          total_bytes: totalMemory,
          used_bytes: usedMemory,
          available_bytes: availableMemory,
          usage_pct:
            totalMemory > 0
              ? Math.round((usedMemory / totalMemory) * 1_000) / 10
              : 0,
        },
        disk: getDiskUsage(storagePath),
      },
    });
  } catch (error) {
    console.error("Error getting server status:", error);
    return Response.json({ error: "Failed to get server status" }, { status: 500 });
  }
}
