import type { Action, ActionContext, ActionResult } from "@keithk/deploy-core";
import { debug, info, warn } from "@keithk/deploy-core";
import { join } from "path";
import { loadEnvFile } from "../utils";

/**
 * Registry for managing and executing actions
 */
export class ActionRegistry {
  private actions: Map<string, Action> = new Map();
  private hookManager?: any; // Will be set after import to avoid circular dependency
  private routeManager?: any; // Will be set after import to avoid circular dependency

  /**
   * Set the hook manager instance
   * @param manager The hook manager instance
   */
  setHookManager(manager: any): void {
    this.hookManager = manager;
  }

  /**
   * Set the route manager instance
   * @param manager The route manager instance
   */
  setRouteManager(manager: any): void {
    this.routeManager = manager;
  }

  /**
   * Register an action with the registry
   * @param action The action to register
   */
  register(action: Action): void {
    if (this.actions.has(action.id)) {
      warn(`Action with ID ${action.id} already exists. Overwriting.`);
    }

    this.actions.set(action.id, action);
    info(`Registered action: ${action.id} (${action.type})`);

    // Register hooks if present and hook manager is available
    if (this.hookManager && action.hooks && action.hooks.length > 0) {
      for (const hook of action.hooks) {
        this.hookManager.registerHook(hook, action);
      }
      debug(`Registered ${action.hooks.length} hooks for action ${action.id}`);
    }

    // Register routes if present and route manager is available
    if (this.routeManager && action.routes && action.routes.length > 0) {
      for (const route of action.routes) {
        this.routeManager.registerRoute(action, route);
      }
      debug(
        `Registered ${action.routes.length} routes for action ${action.id}`
      );
    }
  }

  /**
   * Get an action by ID
   * @param id The action ID
   * @returns The action or undefined if not found
   */
  get(id: string): Action | undefined {
    return this.actions.get(id);
  }

  /**
   * Get all actions of a specific type
   * @param type The action type
   * @returns Array of actions of the specified type
   */
  getByType(type: string): Action[] {
    return Array.from(this.actions.values()).filter(
      (action) => action.type === type
    );
  }

  /**
   * Get all actions for a specific site
   * @param siteId The site ID
   * @returns Array of actions for the specified site
   */
  getBySite(siteId: string): Action[] {
    return Array.from(this.actions.values()).filter(
      (action) => action.siteId === siteId
    );
  }

  /**
   * Get all actions that have a specific hook
   * @param hook The hook to filter by
   * @returns Array of actions with the specified hook
   */
  getByHook(hook: string): Action[] {
    return Array.from(this.actions.values()).filter(
      (action) => action.hooks && action.hooks.includes(hook as any)
    );
  }

  /**
   * Get all registered actions
   * @returns Array of all actions
   */
  getAll(): Action[] {
    return Array.from(this.actions.values());
  }

  /**
   * Execute an action by ID
   * @param id The action ID
   * @param payload The payload to pass to the action
   * @param context The context in which to execute the action
   * @returns The result of the action execution
   */
  async execute(
    id: string,
    payload: any,
    context: ActionContext
  ): Promise<ActionResult> {
    const action = this.actions.get(id);

    if (!action) {
      return {
        success: false,
        message: `Action with ID ${id} not found`
      };
    }

    try {
      info(`Executing action: ${action.id} (${action.type})`);

      // Enhance context with action-specific config
      const enhancedContext: ActionContext = {
        ...context,
        config: action.config
      };

      // If this is a site-specific action, add the site to the context
      // and load site-specific environment variables
      let siteEnv: Record<string, string> = {};
      if (action.siteId) {
        const site = context.sites.find((s) => s.subdomain === action.siteId);
        if (site) {
          enhancedContext.site = site;

          // Load site-specific .env file
          const envPath = join(site.path, ".env");
          debug(`Loading site-specific environment from ${envPath}`);
          siteEnv = await loadEnvFile(envPath);
          debug(
            `Loaded site-specific environment for ${site.subdomain} with ${
              Object.keys(siteEnv).length
            } variables`
          );

          // Add site-specific environment to the context
          enhancedContext.env = siteEnv;
        }
      }

      // Execute the action handler with the enhanced context
      const result = await action.handler(payload, enhancedContext);

      info(
        `Action ${action.id} completed: ${
          result.success ? "Success" : "Failed"
        }`
      );
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      warn(`Error executing action ${action.id}: ${errorMessage}`);
      return {
        success: false,
        message: `Error executing action: ${errorMessage}`
      };
    }
  }

  /**
   * Unregister an action
   * @param id The action ID
   */
  unregister(id: string): void {
    const action = this.actions.get(id);

    if (!action) {
      return;
    }

    // Unregister hooks if present and hook manager is available
    if (this.hookManager && action.hooks && action.hooks.length > 0) {
      for (const hook of action.hooks) {
        this.hookManager.unregisterHook(hook, action.id);
      }
    }

    // Unregister routes if present and route manager is available
    if (this.routeManager && action.routes && action.routes.length > 0) {
      for (const route of action.routes) {
        this.routeManager.unregisterRoute(route.method, route.path);
      }
    }

    // Remove from registry
    this.actions.delete(id);
    info(`Unregistered action: ${id}`);
  }
}

// Create a singleton instance
export const actionRegistry = new ActionRegistry();
