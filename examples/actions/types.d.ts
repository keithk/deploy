declare module "@dialup-deploy/core" {
  export interface ActionContext {
    rootDir: string;
    mode: "serve" | "dev";
    sites: any[];
    config?: Record<string, any>;
    request?: Request;
    site?: any;
  }

  export interface ActionResult {
    success: boolean;
    message: string;
    data?: any;
  }

  export type ActionHook =
    | "server:before-start"
    | "server:after-start"
    | "server:before-stop"
    | "site:before-build"
    | "site:after-build"
    | "route:before-handle"
    | "route:after-handle";

  export interface ActionRoute {
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";
    handler: (req: Request, context: ActionContext) => Promise<Response>;
    middleware?: ((
      req: Request,
      context: ActionContext
    ) => Promise<Request | Response>)[];
  }

  export interface Action {
    id: string;
    type: string;
    handler: (payload: any, context: ActionContext) => Promise<ActionResult>;
    config?: Record<string, any>;
    siteId?: string;
    hooks?: ActionHook[];
    routes?: ActionRoute[];
  }

  export interface DefineActionOptions {
    id: string;
    type?: string;
    siteId?: string;
    config?: Record<string, any>;
    hooks?: ActionHook[];
    routes?: ActionRoute[];
    handler: (payload: any, context: ActionContext) => Promise<ActionResult>;
  }

  export function defineAction(options: DefineActionOptions): Action;

  export function defineScheduledAction(
    options: Omit<DefineActionOptions, "type" | "hooks"> & { schedule: string }
  ): Action;

  export function defineWebhookAction(
    options: Omit<DefineActionOptions, "type" | "routes"> & {
      path: string;
      method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    }
  ): Action;

  export function defineRouteAction(
    options: Omit<DefineActionOptions, "type" | "routes"> & {
      routes: ActionRoute[];
    }
  ): Action;

  export function defineHookAction(
    options: Omit<DefineActionOptions, "type" | "hooks"> & {
      hooks: ActionHook[];
    }
  ): Action;
}
