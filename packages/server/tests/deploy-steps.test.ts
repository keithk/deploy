// ABOUTME: Integration tests verifying that deploySite records deployment_steps
// ABOUTME: rows in the right order, with the right statuses, on success and failure paths.

import { describe, test, expect, beforeEach, mock } from "bun:test";

// In-memory step recording; the test inspects this directly so we don't
// have to spin up a real database.
type StepRow = {
  id: string;
  deployment_id: string;
  name: string;
  status: "running" | "completed" | "failed";
  error_message: string | null;
};

let stepRows: StepRow[] = [];
let nextStepId = 0;

const stepModelMock = {
  startStep: mock((deploymentId: string, name: string) => {
    const row: StepRow = {
      id: `step-${++nextStepId}`,
      deployment_id: deploymentId,
      name,
      status: "running",
      error_message: null,
    };
    stepRows.push(row);
    return row;
  }),
  completeStep: mock((stepId: string, errorMessage?: string) => {
    const row = stepRows.find((r) => r.id === stepId);
    if (row) {
      row.status = errorMessage ? "failed" : "completed";
      row.error_message = errorMessage ?? null;
    }
  }),
};

const deploymentModelMock = {
  create: mock((data: { site_id: string }) => ({
    id: "dep-1",
    site_id: data.site_id,
    status: "pending",
    started_at: new Date().toISOString(),
    completed_at: null,
    old_container_id: null,
    old_port: null,
    new_container_id: null,
    new_port: null,
    commit_sha: null,
    commit_message: null,
    error_message: null,
  })),
  updateStatus: mock(() => {}),
  update: mock(() => null),
  complete: mock(() => null),
  fail: mock(() => null),
};

const siteRecord = {
  id: "site-1",
  name: "test-site",
  git_url: "https://example.com/repo.git",
  branch: "main",
  type: "auto" as const,
  visibility: "public" as const,
  status: "stopped" as const,
  container_id: null,
  port: null,
  env_vars: "{}",
  persistent_storage: 0,
  autodeploy: 0,
  created_at: new Date().toISOString(),
  last_deployed_at: null,
  sleep_enabled: 0,
  sleep_after_minutes: null,
  last_request_at: null,
};

const siteModelMock = {
  findById: mock(() => siteRecord),
  updateStatus: mock(() => {}),
  markDeployed: mock(() => {}),
};

mock.module("@keithk/deploy-core", () => ({
  info: mock(() => {}),
  debug: mock(() => {}),
  error: mock(() => {}),
  siteModel: siteModelMock,
  logModel: { append: mock(() => {}) },
  actionModel: { upsert: mock(() => {}), deleteBySiteId: mock(() => {}) },
  deploymentModel: deploymentModelMock,
  deploymentStepModel: stepModelMock,
}));

// Knobs the individual tests flip to drive different paths.
let buildSucceeds = true;
let healthSucceeds = true;
let blueGreen = false;

mock.module("../src/services/git", () => ({
  cloneSite: mock(async () => "/tmp/fake-site-path"),
  pullSite: mock(async () => "/tmp/fake-site-path"),
  getSitePath: mock(() => "/tmp/fake-site-path"),
}));

mock.module("../src/services/railpacks", () => ({
  buildWithRailpacks: mock(async () =>
    buildSucceeds
      ? { success: true, imageName: "fake-image" }
      : { success: false, error: "boom" }
  ),
}));

mock.module("../src/services/container", () => ({
  startContainer: mock(async () => ({
    containerId: "container-id",
    port: 8080,
    isBlueGreen: blueGreen,
  })),
  stopContainer: mock(async () => {}),
  completeBlueGreenDeployment: mock(async () => {}),
  rollbackBlueGreenDeployment: mock(async () => {}),
  waitForContainerHealth: mock(async () => healthSucceeds),
  getContainerLogs: mock(async () => ""),
}));

mock.module("../src/services/actions", () => ({
  discoverSiteActions: mock(async () => []),
}));

const { deploySite } = await import("../src/services/deploy");

beforeEach(() => {
  stepRows = [];
  nextStepId = 0;
  buildSucceeds = true;
  healthSucceeds = true;
  blueGreen = false;
  // Ensure the site looks fresh (no existing container) by default.
  siteRecord.status = "stopped";
  siteRecord.container_id = null;
  siteRecord.port = null;
});

describe("deploy step instrumentation", () => {
  test("records all expected steps in order on the happy path (no blue-green)", async () => {
    const result = await deploySite("site-1");

    expect(result.success).toBe(true);
    expect(stepRows.map((s) => s.name)).toEqual([
      "clone",
      "build",
      "start",
      "health_check",
      "register_actions",
    ]);
    expect(stepRows.every((s) => s.status === "completed")).toBe(true);
  });

  test("records the 'switch' step on a blue-green redeploy", async () => {
    blueGreen = true;
    siteRecord.status = "running";
    siteRecord.container_id = "old-container";
    siteRecord.port = 8000;

    await deploySite("site-1");

    expect(stepRows.map((s) => s.name)).toEqual([
      "clone",
      "build",
      "start",
      "health_check",
      "switch",
      "register_actions",
    ]);
    expect(stepRows.every((s) => s.status === "completed")).toBe(true);
  });

  test("marks the build step failed when railpack reports failure", async () => {
    buildSucceeds = false;

    const result = await deploySite("site-1");

    expect(result.success).toBe(false);
    expect(stepRows.map((s) => s.name)).toEqual(["clone", "build"]);
    expect(stepRows[0].status).toBe("completed");
    expect(stepRows[1].status).toBe("failed");
    expect(stepRows[1].error_message).toBe("boom");
  });

  test("marks the health_check step failed when health probes time out", async () => {
    healthSucceeds = false;

    const result = await deploySite("site-1");

    expect(result.success).toBe(false);
    expect(stepRows.map((s) => s.name)).toEqual([
      "clone",
      "build",
      "start",
      "health_check",
    ]);
    expect(stepRows[3].status).toBe("failed");
    expect(stepRows[3].error_message).toBe("Container failed health check");
    // 'switch' and 'register_actions' must NOT have been recorded.
    expect(stepRows.find((s) => s.name === "switch")).toBeUndefined();
    expect(stepRows.find((s) => s.name === "register_actions")).toBeUndefined();
  });
});
