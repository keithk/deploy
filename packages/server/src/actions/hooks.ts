import type {
  Action,
  ActionContext,
  ActionHook,
  ActionResult
} from "@keithk/deploy-core";
import { debug, info, warn } from "@keithk/deploy-core";
import { actionRegistry } from "./registry";

/**
 * Manages action hooks throughout the server lifecycle
 */
export class HookManager {
  private hooks: Map<ActionHook, Action[]> = new Map();
  private registry: typeof actionRegistry;

  constructor(registry = actionRegistry) {
    this.registry = registry;
  }

  /**
   * Register all hooks from the action registry
   */
  registerAllHooks(): void {
    // Clear existing hooks
    this.hooks.clear();

    // Get all actions from the registry
    const actions = this.registry.getAll();

    // Register each action's hooks
    for (const action of actions) {
      if (action.hooks && action.hooks.length > 0) {
        for (const hook of action.hooks) {
          this.registerHook(hook, action);
        }
      }
    }

    // Log registered hooks
    for (const [hook, actions] of this.hooks.entries()) {
      debug(`Registered ${actions.length} actions for hook: ${hook}`);
    }
  }

  /**
   * Register a single action for a specific hook
   * @param hook The hook to register for
   * @param action The action to register
   */
  registerHook(hook: ActionHook, action: Action): void {
    if (!this.hooks.has(hook)) {
      this.hooks.set(hook, []);
    }

    const actions = this.hooks.get(hook)!;

    // Check if action is already registered for this hook
    if (!actions.some((a) => a.id === action.id)) {
      actions.push(action);
      debug(`Registered action ${action.id} for hook: ${hook}`);
    }
  }

  /**
   * Unregister an action from a specific hook
   * @param hook The hook to unregister from
   * @param actionId The ID of the action to unregister
   */
  unregisterHook(hook: ActionHook, actionId: string): void {
    if (this.hooks.has(hook)) {
      const actions = this.hooks.get(hook)!;
      const index = actions.findIndex((a) => a.id === actionId);

      if (index !== -1) {
        actions.splice(index, 1);
        debug(`Unregistered action ${actionId} from hook: ${hook}`);
      }
    }
  }

  /**
   * Execute all actions registered for a specific hook
   * @param hook The hook to execute
   * @param context The action context
   * @param payload Optional payload to pass to the actions
   * @returns Array of action results
   */
  async executeHook(
    hook: ActionHook,
    context: ActionContext,
    payload: any = {}
  ): Promise<ActionResult[]> {
    if (!this.hooks.has(hook) || this.hooks.get(hook)!.length === 0) {
      debug(`No actions registered for hook: ${hook}`);
      return [];
    }

    const actions = this.hooks.get(hook)!;
    const results: ActionResult[] = [];

    info(`Executing ${actions.length} actions for hook: ${hook}`);

    for (const action of actions) {
      try {
        const result = await this.registry.execute(action.id, payload, context);
        results.push(result);

        if (!result.success) {
          warn(
            `Action ${action.id} failed for hook ${hook}: ${result.message}`
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        warn(
          `Error executing action ${action.id} for hook ${hook}: ${errorMessage}`
        );

        results.push({
          success: false,
          message: `Error executing action: ${errorMessage}`
        });
      }
    }

    return results;
  }

  /**
   * Get all actions registered for a specific hook
   * @param hook The hook to get actions for
   * @returns Array of actions registered for the hook
   */
  getActionsForHook(hook: ActionHook): Action[] {
    return this.hooks.get(hook) || [];
  }
}

// Create a singleton instance
export const hookManager = new HookManager();
