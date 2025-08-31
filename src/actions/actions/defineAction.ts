import {
  Action,
  ActionContext,
  ActionHook,
  ActionResult,
  ActionRoute
} from "../types";

/**
 * Options for defining an action
 */
export interface DefineActionOptions {
  /**
   * Unique identifier for the action
   */
  id: string;

  /**
   * Type of the action
   */
  type?: string;

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
  hooks?: ActionHook[];

  /**
   * Routes this action exposes
   */
  routes?: ActionRoute[];

  /**
   * Handler function for the action
   */
  handler: (payload: any, context: ActionContext) => Promise<ActionResult>;
}

/**
 * Define an action with proper typing
 * @param options The action options
 * @returns The defined action
 */
export function defineAction(options: DefineActionOptions): Action {
  return {
    id: options.id,
    type: options.type || "custom",
    siteId: options.siteId,
    config: options.config || {},
    hooks: options.hooks || [],
    routes: options.routes || [],
    handler: options.handler
  };
}
