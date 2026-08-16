// ABOUTME: Tests cancellation of abandoned deployment records in the deploy service.
// ABOUTME: Verifies history, active steps, and site state are finalized together.

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../../core/src/database/database";

const TEST_DATA_DIR = join(tmpdir(), `deploy-cancel-test-${process.pid}`);

if (existsSync(TEST_DATA_DIR)) {
  rmSync(TEST_DATA_DIR, { recursive: true });
}
mkdirSync(TEST_DATA_DIR, { recursive: true });

(Database as unknown as { instance?: Database }).instance = undefined;
const db = Database.getInstance({ dataDir: TEST_DATA_DIR });
await db.runMigrations();

const { deploymentModel, deploymentStepModel, sessionModel, siteModel } =
  await import("@keithk/deploy-core");
const { cancelDeployment } = await import("../src/services/deploy");
const { handleDeploymentsApi } = await import("../src/api/deployments");
const session = sessionModel.create();

function cancelRequest(id: string, authenticated = true): Request {
  return new Request(`http://localhost/api/deployments/${id}/cancel`, {
    method: "POST",
    headers: authenticated ? { cookie: `session=${session.token}` } : {},
  });
}

afterAll(() => {
  db.close();
  (Database as unknown as { instance?: Database }).instance = undefined;
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe("cancelDeployment", () => {
  test("fails a stale deployment and its running step", () => {
    const site = siteModel.create({
      name: "cancel-stale",
      git_url: "https://example.test/cancel-stale.git",
      type: "auto",
    });
    siteModel.updateStatus(site.id, "building");
    const deployment = deploymentModel.create({ site_id: site.id });
    deploymentModel.updateStatus(deployment.id, "building");
    const step = deploymentStepModel.startStep(deployment.id, "build");

    expect(cancelDeployment(deployment.id)).toEqual({ success: true });

    expect(deploymentModel.findById(deployment.id)).toMatchObject({
      status: "failed",
      error_message: "Deployment cancelled by user",
    });
    expect(deploymentStepModel.findByDeploymentId(deployment.id)[0]).toMatchObject({
      id: step.id,
      status: "failed",
      error_message: "Deployment cancelled by user",
    });
    expect(siteModel.findById(site.id)?.status).toBe("stopped");
  });

  test("restores the previous site version for a stale redeployment", () => {
    const site = siteModel.create({
      name: "cancel-redeploy",
      git_url: "https://example.test/cancel-redeploy.git",
      type: "auto",
    });
    siteModel.updateStatus(site.id, "running", "old-container", 8123);
    const deployment = deploymentModel.create({
      site_id: site.id,
      old_container_id: "old-container",
      old_port: 8123,
    });
    deploymentModel.updateStatus(deployment.id, "healthy");
    siteModel.updateStatus(site.id, "building");

    expect(cancelDeployment(deployment.id)).toEqual({ success: true });
    expect(siteModel.findById(site.id)).toMatchObject({
      status: "running",
      container_id: "old-container",
      port: 8123,
    });
  });

  test("rejects missing and terminal deployments", () => {
    expect(cancelDeployment("missing")).toEqual({
      success: false,
      reason: "not_found",
      error: "Deployment not found",
    });

    const site = siteModel.create({
      name: "cancel-finished",
      git_url: "https://example.test/cancel-finished.git",
      type: "auto",
    });
    const deployment = deploymentModel.create({ site_id: site.id });
    deploymentModel.fail(deployment.id, "Already failed");

    expect(cancelDeployment(deployment.id)).toEqual({
      success: false,
      reason: "not_active",
      error: "Deployment is no longer in progress",
    });
    expect(deploymentModel.findById(deployment.id)?.error_message).toBe(
      "Already failed"
    );
  });
});

describe("POST /api/deployments/:id/cancel", () => {
  test("cancels an in-progress deployment", async () => {
    const site = siteModel.create({
      name: "cancel-api",
      git_url: "https://example.test/cancel-api.git",
      type: "auto",
    });
    siteModel.updateStatus(site.id, "building");
    const deployment = deploymentModel.create({ site_id: site.id });
    deploymentModel.updateStatus(deployment.id, "building");

    const response = await handleDeploymentsApi(
      cancelRequest(deployment.id),
      `/api/deployments/${deployment.id}/cancel`
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ message: "Deployment cancelled" });
    expect(deploymentModel.findById(deployment.id)?.status).toBe("failed");
  });

  test("requires authentication", async () => {
    const response = await handleDeploymentsApi(
      cancelRequest("deployment-123", false),
      "/api/deployments/deployment-123/cancel"
    );

    expect(response?.status).toBe(401);
  });

  test("returns 404 when the deployment does not exist", async () => {
    const response = await handleDeploymentsApi(
      cancelRequest("missing"),
      "/api/deployments/missing/cancel"
    );

    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual({ error: "Deployment not found" });
  });

  test("returns 409 when the deployment already finished", async () => {
    const site = siteModel.create({
      name: "cancel-api-finished",
      git_url: "https://example.test/cancel-api-finished.git",
      type: "auto",
    });
    const deployment = deploymentModel.create({ site_id: site.id });
    deploymentModel.complete(deployment.id, "container", 8124);

    const response = await handleDeploymentsApi(
      cancelRequest(deployment.id),
      `/api/deployments/${deployment.id}/cancel`
    );

    expect(response?.status).toBe(409);
    expect(await response?.json()).toEqual({
      error: "Deployment is no longer in progress",
    });
  });
});
