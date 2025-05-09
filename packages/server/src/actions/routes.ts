import type { Action, ActionContext, ActionRoute } from "@keithk/deploy-core";
import { debug, info, warn } from "@keithk/deploy-core";
import { actionRegistry } from "./registry";
import { hookManager } from "./hooks";

/**
 * Manages routes exposed by actions
 */
export class RouteManager {
  private routes: Map<string, { action: Action; route: ActionRoute }> =
    new Map();
  private registry: typeof actionRegistry;

  constructor(registry = actionRegistry) {
    this.registry = registry;
  }

  /**
   * Register all routes from the action registry
   */
  registerAllRoutes(): void {
    // Clear existing routes
    this.routes.clear();

    // Get all actions from the registry
    const actions = this.registry.getAll();

    // Register each action's routes
    for (const action of actions) {
      if (action.routes && action.routes.length > 0) {
        for (const route of action.routes) {
          this.registerRoute(action, route);
        }
      }
    }

    // Log registered routes
    debug(`Registered ${this.routes.size} routes from actions`);
    for (const [path, { action }] of this.routes.entries()) {
      debug(`Route: ${path} -> Action: ${action.id}`);
    }
  }

  /**
   * Register a single route for an action
   * @param action The action that exposes the route
   * @param route The route to register
   */
  registerRoute(action: Action, route: ActionRoute): void {
    // Create a unique key for the route (method + path)
    const routeKey = `${route.method}:${route.path}`;

    // Check if route already exists
    if (this.routes.has(routeKey)) {
      warn(
        `Route ${routeKey} already registered by action ${
          this.routes.get(routeKey)?.action.id
        }. Overwriting with action ${action.id}.`
      );
    }

    // Register the route
    this.routes.set(routeKey, { action, route });
    debug(`Registered route ${routeKey} for action ${action.id}`);
  }

  /**
   * Unregister a route
   * @param method The HTTP method
   * @param path The route path
   */
  unregisterRoute(method: string, path: string): void {
    const routeKey = `${method}:${path}`;

    if (this.routes.has(routeKey)) {
      const { action } = this.routes.get(routeKey)!;
      this.routes.delete(routeKey);
      debug(`Unregistered route ${routeKey} for action ${action.id}`);
    }
  }

  /**
   * Find a route handler for a request
   * @param request The HTTP request
   * @returns The route handler or null if not found
   */
  findRouteHandler(request: Request): {
    action: Action;
    route: ActionRoute;
  } | null {
    const url = new URL(request.url);
    const method = request.method;

    // Create a route key to look up
    const routeKey = `${method}:${url.pathname}`;

    // Check for exact match first
    if (this.routes.has(routeKey)) {
      return this.routes.get(routeKey)!;
    }

    // TODO: Add support for path parameters and pattern matching

    return null;
  }

  /**
   * Handle a request using the appropriate route handler
   * @param request The HTTP request
   * @param context The action context
   * @returns The response from the route handler or null if no handler found
   */
  async handleRequest(
    request: Request,
    context: ActionContext
  ): Promise<Response | null> {
    const routeHandler = this.findRouteHandler(request);

    if (!routeHandler) {
      return null;
    }

    const { action, route } = routeHandler;

    // Create a context with the request
    const routeContext: ActionContext = {
      ...context,
      request
    };

    try {
      // Execute before-handle hook
      await hookManager.executeHook("route:before-handle", routeContext, {
        request,
        route: route.path,
        method: route.method,
        actionId: action.id
      });

      // Apply middleware if present
      let currentRequest = request;
      let earlyResponse: Response | null = null;

      if (route.middleware && route.middleware.length > 0) {
        for (const middleware of route.middleware) {
          const result = await middleware(currentRequest, routeContext);

          if (result instanceof Response) {
            // Middleware returned a response, short-circuit
            earlyResponse = result;
            break;
          } else {
            // Middleware returned a modified request
            currentRequest = result;
          }
        }
      }

      // If middleware returned a response, use that
      let response: Response;
      if (earlyResponse) {
        response = earlyResponse;
      } else {
        // Otherwise, call the route handler
        response = await route.handler(currentRequest, routeContext);
      }

      // Execute after-handle hook
      await hookManager.executeHook("route:after-handle", routeContext, {
        request,
        response,
        route: route.path,
        method: route.method,
        actionId: action.id
      });

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      warn(
        `Error handling route ${route.method}:${route.path}: ${errorMessage}`
      );

      // Return a 500 error response
      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          message: errorMessage
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

  /**
   * Get all registered routes
   * @returns Array of registered routes
   */
  getAllRoutes(): { method: string; path: string; actionId: string }[] {
    return Array.from(this.routes.entries()).map(([key, { action, route }]) => {
      const [method, path] = key.split(":");
      return {
        method,
        path,
        actionId: action.id
      };
    });
  }
}

// Create a singleton instance
export const routeManager = new RouteManager();
