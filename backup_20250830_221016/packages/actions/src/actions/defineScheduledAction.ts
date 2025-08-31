import { Action, ActionContext, ActionResult } from "../types";
import { defineAction } from "./defineAction";

/**
 * Options for defining a scheduled action
 */
export interface DefineScheduledActionOptions {
  /**
   * Unique identifier for the action
   */
  id: string;

  /**
   * Site ID for site-specific actions
   */
  siteId?: string;

  /**
   * Configuration for the action
   */
  config?: Record<string, any>;

  /**
   * Cron schedule expression
   */
  schedule: string;

  /**
   * Handler function for the action
   */
  handler: (payload: any, context: ActionContext) => Promise<ActionResult>;
}

/**
 * Define a scheduled action
 * @param options The action options
 * @returns The defined action
 */
export function defineScheduledAction(
  options: DefineScheduledActionOptions
): Action {
  return defineAction({
    ...options,
    type: "scheduled",
    config: {
      ...(options.config || {}),
      schedule: options.schedule
    }
  });
}
