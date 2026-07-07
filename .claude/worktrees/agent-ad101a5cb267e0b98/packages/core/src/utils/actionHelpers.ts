import type {
  Action,
  ActionContext,
  ActionHook,
  ActionResult,
  ActionRoute
} from "../types/action";

/**
 * Options for defining an action
 */
export interface DefineActionOptions {
  id: string;
  type?: string;
  siteId?: string;
  config?: Record<string, any>;
  hooks?: ActionHook[];
  routes?: ActionRoute[];
  handler: (payload: any, context: ActionContext) => Promise<ActionResult>;
}

/**
 * Helper function to define an action with proper typing
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

/**
 * Helper function to define a scheduled action
 * @param options The action options
 * @param schedule The cron schedule expression
 * @returns The defined scheduled action
 */
export function defineScheduledAction(
  options: Omit<DefineActionOptions, "type" | "hooks"> & { schedule: string }
): Action {
  return {
    ...defineAction({
      ...options,
      type: "scheduled"
    }),
    config: {
      ...(options.config || {}),
      schedule: options.schedule
    }
  };
}

/**
 * Helper function to define a webhook action
 * @param options The action options
 * @param path The webhook path
 * @param method The HTTP method (default: POST)
 * @returns The defined webhook action
 */
export function defineWebhookAction(
  options: Omit<DefineActionOptions, "type" | "routes"> & {
    path: string;
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  }
): Action {
  const method = options.method || "POST";
  const path = options.path;

  return {
    ...defineAction({
      ...options,
      type: "webhook"
    }),
    routes: [
      {
        path,
        method,
        handler: async (req, context) => {
          try {
            // Parse the request body if it's JSON
            let body: any = {};
            if (req.headers.get("content-type")?.includes("application/json")) {
              const text = await req.text();
              if (text) {
                body = JSON.parse(text);
              }
            }

            // Execute the action handler
            const result = await options.handler(
              {
                body,
                headers: Object.fromEntries(req.headers.entries()),
                method: req.method,
                url: req.url
              },
              context
            );

            // Return the result as JSON
            return new Response(JSON.stringify(result), {
              status: result.success ? 200 : 400,
              headers: {
                "Content-Type": "application/json"
              }
            });
          } catch (error) {
            // Handle errors
            return new Response(
              JSON.stringify({
                success: false,
                message: `Error processing webhook: ${
                  error instanceof Error ? error.message : String(error)
                }`
              }),
              {
                status: 500,
                headers: {
                  "Content-Type": "application/json"
                }
              }
            );
          }
        }
      }
    ]
  };
}

/**
 * Helper function to define a route action
 * @param options The action options
 * @param routes The routes to expose
 * @returns The defined route action
 */
export function defineRouteAction(
  options: Omit<DefineActionOptions, "type" | "routes"> & {
    routes: ActionRoute[];
  }
): Action {
  return {
    ...defineAction({
      ...options,
      type: "route"
    }),
    routes: options.routes
  };
}

/**
 * Helper function to define a lifecycle hook action
 * @param options The action options
 * @param hooks The lifecycle hooks to attach to
 * @returns The defined lifecycle hook action
 */
export function defineHookAction(
  options: Omit<DefineActionOptions, "type" | "hooks"> & {
    hooks: ActionHook[];
  }
): Action {
  return {
    ...defineAction({
      ...options,
      type: "hook"
    }),
    hooks: options.hooks
  };
}
