// ABOUTME: Model for DeploymentStep CRUD operations against the deployment_steps table.
// ABOUTME: Records per-phase timing of a deployment for the deploy waterfall view.

import { randomUUID } from "crypto";
import { Database } from "../database";
import type { DeploymentStep, DeploymentStepName } from "../schema";

export class DeploymentStepModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Begin timing a new step. Inserts a row with status=running and
   * started_at=now. Returns the created row so callers can pass the id
   * to completeStep() later.
   */
  public startStep(deploymentId: string, name: DeploymentStepName): DeploymentStep {
    const step: DeploymentStep = {
      id: randomUUID(),
      deployment_id: deploymentId,
      name,
      status: "running",
      started_at: new Date().toISOString(),
      completed_at: null,
      error_message: null,
    };

    this.db
      .prepare(
        `INSERT INTO deployment_steps
         (id, deployment_id, name, status, started_at, completed_at, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        step.id,
        step.deployment_id,
        step.name,
        step.status,
        step.started_at,
        step.completed_at,
        step.error_message
      );

    return step;
  }

  /**
   * Mark a step finished. With no errorMessage, status becomes 'completed';
   * with one, status becomes 'failed' and the message is persisted.
   */
  public completeStep(stepId: string, errorMessage?: string): void {
    const status = errorMessage ? "failed" : "completed";
    this.db
      .prepare(
        `UPDATE deployment_steps
         SET status = ?, completed_at = ?, error_message = ?
         WHERE id = ?`
      )
      .run(status, new Date().toISOString(), errorMessage ?? null, stepId);
  }

  /**
   * Find all steps for a deployment, ordered by start time ascending.
   */
  public findByDeploymentId(deploymentId: string): DeploymentStep[] {
    return this.db.query<DeploymentStep>(
      `SELECT * FROM deployment_steps
       WHERE deployment_id = ?
       ORDER BY started_at ASC`,
      [deploymentId]
    );
  }

  /**
   * Batch-fetch steps for many deployments in a single query.
   * Returns a Map keyed by deployment_id; deployments with no steps are absent.
   */
  public findManyByDeploymentIds(
    deploymentIds: string[]
  ): Map<string, DeploymentStep[]> {
    const result = new Map<string, DeploymentStep[]>();
    if (deploymentIds.length === 0) return result;

    const placeholders = deploymentIds.map(() => "?").join(",");
    const rows = this.db.query<DeploymentStep>(
      `SELECT * FROM deployment_steps
       WHERE deployment_id IN (${placeholders})
       ORDER BY started_at ASC`,
      deploymentIds
    );

    for (const row of rows) {
      const list = result.get(row.deployment_id);
      if (list) {
        list.push(row);
      } else {
        result.set(row.deployment_id, [row]);
      }
    }
    return result;
  }
}

export const deploymentStepModel = new DeploymentStepModel();
