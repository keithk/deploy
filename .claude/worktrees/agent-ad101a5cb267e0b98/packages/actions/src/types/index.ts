/**
 * Site configuration
 */
export interface SiteConfig {
  subdomain: string;
  path: string;
  route?: string;
  type: string;
  commands?: {
    build?: string;
    start?: string;
  };
}

/**
 * Action context
 */
export interface ActionContext {
  rootDir: string;
  mode: "serve" | "dev";
  sites: SiteConfig[];
  config?: Record<string, any>;
  request?: Request;
  site?: SiteConfig;
  env?: Record<string, string>;
}

/**
 * Action result
 */
export interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Action hook
 */
export type ActionHook =
  | "server:before-start"
  | "server:after-start"
  | "server:before-stop"
  | "site:before-build"
  | "site:after-build"
  | "route:before-handle"
  | "route:after-handle";

/**
 * Action route
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
 * Action
 */
export interface Action {
  id: string;
  type: string;
  handler: (payload: any, context: ActionContext) => Promise<ActionResult>;
  config?: Record<string, any>;
  siteId?: string;
  hooks?: ActionHook[];
  routes?: ActionRoute[];
}

// Export process types
export * from "./process";
