// ABOUTME: Tests the host statistics returned by GET /api/server/status.
// ABOUTME: Verifies resource values are bounded and disk failures degrade gracefully.

import { describe, expect, test } from "bun:test";
import { handleGetServerStatus } from "../src/api/server-status";

describe("GET /api/server/status", () => {
  test("returns host CPU, memory, disk, load, and uptime", async () => {
    const response = handleGetServerStatus("/");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("running");
    expect(typeof body.recorded_at).toBe("string");

    expect(body.host.cpu.cores).toBeGreaterThan(0);
    expect(body.host.cpu.usage_pct).toBeGreaterThanOrEqual(0);
    expect(body.host.cpu.usage_pct).toBeLessThanOrEqual(100);
    expect(body.host.cpu.load_average).toHaveLength(3);

    expect(body.host.memory.total_bytes).toBeGreaterThan(0);
    expect(body.host.memory.used_bytes).toBeGreaterThanOrEqual(0);
    expect(body.host.memory.available_bytes).toBeGreaterThanOrEqual(0);
    expect(body.host.memory.usage_pct).toBeGreaterThanOrEqual(0);
    expect(body.host.memory.usage_pct).toBeLessThanOrEqual(100);

    expect(body.host.disk).not.toBeNull();
    expect(body.host.disk.total_bytes).toBeGreaterThan(0);
    expect(body.host.disk.used_bytes).toBeGreaterThanOrEqual(0);
    expect(body.host.disk.usage_pct).toBeGreaterThanOrEqual(0);
    expect(body.host.disk.usage_pct).toBeLessThanOrEqual(100);

    expect(body.host.uptime_seconds).toBeGreaterThan(0);
    expect(typeof body.host.hostname).toBe("string");
    expect(typeof body.host.platform).toBe("string");
    expect(typeof body.host.release).toBe("string");
  });

  test("keeps legacy process fields", async () => {
    const body = await handleGetServerStatus("/").json();

    expect(typeof body.uptime).toBe("number");
    expect(typeof body.memory.rss).toBe("number");
    expect(typeof body.version).toBe("string");
  });

  test("still returns host stats when storage usage is unavailable", async () => {
    const response = handleGetServerStatus("/path/that/does/not/exist");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.host.disk).toBeNull();
    expect(body.host.cpu.cores).toBeGreaterThan(0);
    expect(body.host.memory.total_bytes).toBeGreaterThan(0);
  });
});
