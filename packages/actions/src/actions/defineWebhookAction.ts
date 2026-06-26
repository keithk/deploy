import { Action, ActionContext, ActionResult } from "../types";
import { defineAction } from "./defineAction";

/**
 * Options for defining a webhook action
 */
export interface DefineWebhookActionOptions {
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
   * URL path for the webhook endpoint (e.g., "/webhook/stripe")
   */
  path: string;

  /**
   * Handler function for the webhook payload
   */
  handler: (payload: any, context: ActionContext) => Promise<ActionResult>;
}

/**
 * Define a webhook action
 * @param options The action options
 * @returns The defined action
 */
export function defineWebhookAction(options: DefineWebhookActionOptions): Action {
  return defineAction({
    ...options,
    type: "webhook",
    config: {
      ...options.config,
      path: options.path
    }
  });
}
