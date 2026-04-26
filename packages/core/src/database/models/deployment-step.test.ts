// ABOUTME: Tests for DeploymentStepModel covering CRUD, ordering, batch fetch, and FK cascade.
// ABOUTME: Verifies the timing data backing the deploy waterfall view is recorded correctly.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "../database";
import { DeploymentStepModel } from "./deployment-step";
import { DeploymentModel } from "./deployment";
import { rmSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_DATA_DIR = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "test-data-deployment-step"
);

describe("DeploymentStepModel", () => {
  let db: Database;
  let stepModel: DeploymentStepModel;
  let deploymentModel: DeploymentModel;

  beforeEach(async () => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });

    (Database as any).instance = undefined;
    db = Database.getInstance({ dataDir: TEST_DATA_DIR });
    await db.runMigrations();

    stepModel = new DeploymentStepModel();
    deploymentModel = new DeploymentModel();

    // The deployments table has an FK to sites; insert a parent row.
    db.run(
      `INSERT INTO sites (id, name, git_url, type, env_vars) VALUES (?, ?, ?, ?, ?)`,
      ["test-site", "test-site", "https://example.com/repo.git", "auto", "{}"]
    );
  });

  afterEach(() => {
    db.close();
    (Database as any).instance = undefined;
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  function makeDeployment(): string {
    return deploymentModel.create({ site_id: "test-site" }).id;
  }

  test("startStep inserts a row with running status and started_at", () => {
    const dep = makeDeployment();
    const before = Date.now();
    const step = stepModel.startStep(dep, "clone");
    const after = Date.now();

    expect(step.deployment_id).toBe(dep);
    expect(step.name).toBe("clone");
    expect(step.status).toBe("running");
    expect(step.completed_at).toBeNull();
    expect(step.error_message).toBeNull();

    const startedMs = new Date(step.started_at).getTime();
    expect(startedMs).toBeGreaterThanOrEqual(before);
    expect(startedMs).toBeLessThanOrEqual(after);

    const persisted = stepModel.findByDeploymentId(dep);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe(step.id);
  });

  test("completeStep without error sets status=completed and completed_at", () => {
    const dep = makeDeployment();
    const step = stepModel.startStep(dep, "build");
    stepModel.completeStep(step.id);

    const [persisted] = stepModel.findByDeploymentId(dep);
    expect(persisted.status).toBe("completed");
    expect(persisted.completed_at).not.toBeNull();
    expect(persisted.error_message).toBeNull();
  });

  test("completeStep with error sets status=failed and error_message", () => {
    const dep = makeDeployment();
    const step = stepModel.startStep(dep, "build");
    stepModel.completeStep(step.id, "build script exited with code 1");

    const [persisted] = stepModel.findByDeploymentId(dep);
    expect(persisted.status).toBe("failed");
    expect(persisted.completed_at).not.toBeNull();
    expect(persisted.error_message).toBe("build script exited with code 1");
  });

  test("findByDeploymentId returns steps ordered by started_at ASC", async () => {
    const dep = makeDeployment();

    stepModel.startStep(dep, "clone");
    await new Promise((r) => setTimeout(r, 5));
    stepModel.startStep(dep, "build");
    await new Promise((r) => setTimeout(r, 5));
    stepModel.startStep(dep, "start");

    const steps = stepModel.findByDeploymentId(dep);
    expect(steps.map((s) => s.name)).toEqual(["clone", "build", "start"]);
  });

  test("findManyByDeploymentIds batches and returns a Map keyed by deployment_id", () => {
    const depA = makeDeployment();
    const depB = makeDeployment();
    const depC = makeDeployment();

    stepModel.startStep(depA, "clone");
    stepModel.startStep(depA, "build");
    stepModel.startStep(depB, "clone");
    // depC has no steps

    const result = stepModel.findManyByDeploymentIds([depA, depB, depC]);

    expect(result.get(depA)).toHaveLength(2);
    expect(result.get(depB)).toHaveLength(1);
    expect(result.has(depC)).toBe(false);
  });

  test("findManyByDeploymentIds returns empty map for empty input", () => {
    const result = stepModel.findManyByDeploymentIds([]);
    expect(result.size).toBe(0);
  });

  test("steps cascade-delete when their deployment is deleted", () => {
    const dep = makeDeployment();
    stepModel.startStep(dep, "clone");
    stepModel.startStep(dep, "build");

    expect(stepModel.findByDeploymentId(dep)).toHaveLength(2);

    db.run(`DELETE FROM deployments WHERE id = ?`, [dep]);

    expect(stepModel.findByDeploymentId(dep)).toHaveLength(0);
  });
});
