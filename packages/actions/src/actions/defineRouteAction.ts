import { Action, ActionContext, ActionResult, ActionRoute } from "../types";
import { defineAction } from "./defineAction";

/**
 * Options for defining a route action
 */
export interface DefineRouteActionOptions {
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
   * Routes this action exposes
   */
  routes: ActionRoute[];

  /**
   * Handler function for the action
   */
  handler: (payload: any, context: ActionContext) => Promise<ActionResult>;
}

/**
 * Define a route action
 * @param options The action options
 * @returns The defined action
 */
export function defineRouteAction(options: DefineRouteActionOptions): Action {
  return defineAction({
    ...options,
    type: "route"
  });
}
