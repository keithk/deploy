import type { Action, ActionContext } from "../../core";
import { actionRegistry } from "./registry";
import { Cron } from "croner";

interface ScheduledJob {
  id: string;
  action: Action;
  schedule: string;
  context: ActionContext;
  cronJob: Cron | null;
  nextRun: Date | null;
}

/**
 * Simple scheduler for timed actions
 */
export class ActionScheduler {
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private registry: typeof actionRegistry;

  constructor(registry = actionRegistry) {
    this.registry = registry;
  }

  /**
   * Schedule an action to run at a specific time
   * @param action The action to schedule
   * @param schedule Cron expression
   * @param context The action context
   */
  scheduleAction(
    action: Action,
    schedule: string,
    context: ActionContext
  ): void {
    // Stop any existing job for this action
    this.stopScheduledAction(action.id);

    // Create a new Cron job
    const cronJob = new Cron(schedule, async () => {
      await this.executeAction(action.id, context);
    });

    if (!cronJob.nextRun()) {
      console.warn(
        `Invalid schedule expression: ${schedule} for action ${action.id}`
      );
      return;
    }

    console.log(
      `Scheduled action ${
        action.id
      } with cron '${schedule}', next run at ${cronJob.nextRun()}`
    );

    this.scheduledJobs.set(action.id, {
      id: action.id,
      action,
      schedule,
      context,
      cronJob,
      nextRun: cronJob.nextRun() || null
    });
  }

  /**
   * Stop a scheduled action
   * @param actionId The ID of the action to stop
   */
  stopScheduledAction(actionId: string): void {
    const job = this.scheduledJobs.get(actionId);
    if (job && job.cronJob) {
      job.cronJob.stop();
      this.scheduledJobs.delete(actionId);
      console.log(`Stopped scheduled action: ${actionId}`);
    }
  }

  /**
   * Stop all scheduled actions
   */
  stopAllScheduledActions(): void {
    for (const [actionId, job] of this.scheduledJobs.entries()) {
      if (job.cronJob) {
        job.cronJob.stop();
      }
    }
    this.scheduledJobs.clear();
    console.log("Stopped all scheduled actions");
  }

  /**
   * Get all scheduled actions
   * @returns Array of scheduled job information
   */
  getScheduledActions(): { id: string; nextRun: Date | null }[] {
    return Array.from(this.scheduledJobs.values()).map((job) => ({
      id: job.id,
      nextRun: job.cronJob?.nextRun() || null
    }));
  }

  /**
   * Execute an action
   * @param actionId The ID of the action to execute
   * @param context The action context
   */
  private async executeAction(
    actionId: string,
    context: ActionContext
  ): Promise<void> {
    console.log(`Executing scheduled action: ${actionId}`);
    try {
      await this.registry.execute(actionId, {}, context);
    } catch (error) {
      console.error(`Error executing scheduled action ${actionId}:`, error);
    }
  }

  /**
   * Reschedule an action for its next run
   * @param actionId The ID of the action to reschedule
   */
  private rescheduleAction(actionId: string): void {
    // No-op: Croner handles rescheduling automatically
  }

  /**
   * Parse a cron expression and calculate the next run time
   * @param cronExpression The cron expression to parse
   * @returns The next run time or null if the expression is invalid
   */
  private getNextRunTime(cronExpression: string): Date | null {
    try {
      const cronJob = new Cron(cronExpression);
      return cronJob.nextRun() || null;
    } catch (error) {
      console.error("Error parsing cron expression:", error);
      return null;
    }
  }
}

export const actionScheduler = new ActionScheduler();
