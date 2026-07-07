import type { SiteConfig } from "./site";

/**
 * Represents the context in which an action is executed
 */
export interface ActionContext {
  rootDir: string;
  mode: "serve" | "dev";
  sites: SiteConfig[];
  config?: Record<string, any>;
  request?: Request; // Available when action is triggered by a route
  site?: SiteConfig; // Available for site-specific actions
  env?: Record<string, string>; // Site-specific environment variables
}

/**
 * Represents the result of an action execution
 */
export interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Server lifecycle hooks that actions can attach to
 */
export type ActionHook =
  | "server:before-start" // Before server starts
  | "server:after-start" // After server starts
  | "server:before-stop" // Before server stops
  | "site:before-build" // Before a site is built
  | "site:after-build" // After a site is built
  | "route:before-handle" // Before a route is handled
  | "route:after-handle"; // After a route is handled

/**
 * Route definition for actions that expose routes
 */
export interface ActionRoute {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";
  handler: (req: Request, context: ActionContext) => Promise<Response>;
  middleware?: ((
    req: Request,
    context: ActionContext
  ) => Promise<Request | Response>)[];
}

/**
 * Represents an action that can be executed
 */
export interface Action {
  id: string;
  type: string;
  handler: (payload: any, context: ActionContext) => Promise<ActionResult>;
  config?: Record<string, any>;
  siteId?: string; // Optional site ID for site-specific actions
  hooks?: ActionHook[]; // Lifecycle hooks this action responds to
  routes?: ActionRoute[]; // Routes this action exposes
}

/**
 * Configuration for a scheduled action
 */
export interface ScheduledActionConfig {
  id: string;
  type: "scheduled";
  schedule: string; // Cron expression
  command: string;
  triggerBuild: boolean;
}

/**
 * Configuration for a webhook action
 */
export interface WebhookActionConfig {
  id: string;
  type: "webhook";
  path: string;
  secret?: string;
}

/**
 * Root level configuration for actions
 */
export interface RootActionConfig {
  github?: {
    repository: string;
    branch: string;
    secret?: string;
  };
  actions?: {
    enabled: boolean;
    webhookPath?: string;
  };
}

/**
 * Site-specific action configuration
 */
export interface SiteActionConfig {
  actions: (ScheduledActionConfig | WebhookActionConfig)[];
}
