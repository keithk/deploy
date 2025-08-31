import { Action, ActionContext, ActionHook, ActionResult } from "../types";
import { defineAction } from "./defineAction";

/**
 * Options for defining a hook action
 */
export interface DefineHookActionOptions {
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
   * Lifecycle hooks this action responds to
   */
  hooks: ActionHook[];

  /**
   * Handler function for the action
   */
  handler: (payload: any, context: ActionContext) => Promise<ActionResult>;
}

/**
 * Define a hook action
 * @param options The action options
 * @returns The defined action
 */
export function defineHookAction(options: DefineHookActionOptions): Action {
  return defineAction({
    ...options,
    type: "hook"
  });
}
