// Export types
export * from "../../core";

// Export registry
export * from "./registry";

// Export discovery functions
export * from "./discovery";

// Export scheduler
export * from "./scheduler";

// Export hook manager
export * from "./hooks";

// Export route manager
export * from "./routes";

// Export handlers
export { createGitHubAction } from "./handlers/github";

// Re-export middleware
export { webhookMiddleware } from "../middleware/webhook";

import { debug, info, warn, error } from "../../core";
import { processManager } from "../utils/process-manager";
import { actionRegistry } from "./registry";
import { hookManager } from "./hooks";
import { routeManager } from "./routes";

// Re-export buildSite from discovery
export { buildSite } from "./discovery";

// Set up circular dependencies
actionRegistry.setHookManager(hookManager);
actionRegistry.setRouteManager(routeManager);

/**
 * Initialize the action system
 * @param rootConfig Root configuration
 */
export function initializeActionSystem(rootConfig: any): void {
  debug("Initializing action system");

  // Initialize GitHub action if configured
  if (rootConfig.github) {
    initializeGitHubAction(rootConfig);
  }

  // Register all hooks and routes
  hookManager.registerAllHooks();
  routeManager.registerAllRoutes();

  debug("Action system initialized");
}

/**
 * Initialize the GitHub action
 * @param rootConfig Root configuration
 */
export function initializeGitHubAction(rootConfig: any): void {
  debug("Initializing GitHub action with config:", rootConfig.github);

  if (rootConfig.github) {
    const { createGitHubAction } = require("./handlers/github");
    const githubAction = createGitHubAction(rootConfig.github);
    debug("Created GitHub action:", githubAction.id, githubAction.type);
    actionRegistry.register(githubAction);

    // Verify the action was registered
    const registeredAction = actionRegistry.get(githubAction.id);
    debug("Registered GitHub action:", registeredAction ? "YES" : "NO");
  } else {
    debug("No GitHub config found, skipping GitHub action initialization");
  }
}

/**
 * Execute a hook in the server lifecycle
 * @param hook The hook to execute
 * @param context The action context
 * @param payload Optional payload to pass to the actions
 */
export async function executeHook(
  hook: string,
  context: any,
  payload: any = {}
): Promise<void> {
  debug(`Executing hook: ${hook}`);
  await hookManager.executeHook(hook as any, context, payload);
}

/**
 * Parse command string to separate environment variables from the actual command
 */
function parseCommand(command: string): { env: Record<string, string>; cmd: string[] } {
  const parts = command.trim().split(/\s+/);
  const env: Record<string, string> = {};
  let cmdStart = 0;

  // Look for environment variable assignments at the beginning
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.includes('=') && !part.startsWith('-')) {
      const [key, ...valueParts] = part.split('=');
      if (key && valueParts.length > 0) {
        env[key] = valueParts.join('=');
        cmdStart = i + 1;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  const cmd = parts.slice(cmdStart);
  return { env, cmd };
}

/**
 * Execute a command in a site's directory
 * @param command The command to execute
 * @param options Options for command execution
 * @returns Result of the command execution
 */
export async function executeCommand(
  command: string,
  options: { cwd?: string; env?: Record<string, string> } = {}
): Promise<{
  success: boolean;
  message: string;
  data?: any;
}> {        
  const cwd = options.cwd || process.cwd();
  const optionsEnv = options.env || {};

  info(`Executing command: ${command} in ${cwd}`);

  try {
    // Parse command to extract environment variables
    const { env: commandEnv, cmd } = parseCommand(command);
    
    // Merge environment variables: process.env + options.env + command env vars
    const mergedEnv = { ...process.env, ...optionsEnv, ...commandEnv };

    const proc = Bun.spawn({
      cmd,
      cwd,
      env: mergedEnv,
      stdout: "pipe",
      stderr: "pipe"
    });

    // Collect stdout and stderr
    let stdout = "";
    let stderr = "";

    if (proc.stdout) {
      const reader = proc.stdout.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        stdout += text;
      }
    }

    if (proc.stderr) {
      const reader = proc.stderr.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        stderr += text;
      }
    }

    const exitCode = await proc.exited;

    if (exitCode === 0) {
      return {
        success: true,
        message: `Command executed successfully`,
        data: { stdout, stderr, exitCode }
      };
    } else {
      warn(`Command failed with exit code ${exitCode}: ${stderr}`);
      return {
        success: false,
        message: `Command failed with exit code ${exitCode}`,
        data: { stdout, stderr, exitCode }
      };
    }
  } catch (err) {
    error(`Error executing command: ${err}`);
    return {
      success: false,
      message: `Error executing command: ${err}`,
      data: { error: err }
    };
  }
}

/**
 * Restart a site's processes
 * @param siteName The name of the site to restart
 * @returns Result of the restart operation
 */
export async function restartSite(siteName: string): Promise<{
  success: boolean;
  message: string;
  data?: any;
}> {
  info(`Action system requesting restart of site: ${siteName}`);

  try {
    const result = await processManager.restartSiteProcesses(siteName);

    if (result.success) {
      return {
        success: true,
        message: `Successfully restarted processes for site: ${siteName}`,
        data: result.results
      };
    } else {
      const processCount = Object.keys(result.results).length;
      if (processCount === 0) {
        warn(`No processes found for site: ${siteName}`);
        return {
          success: false,
          message: `No processes found for site: ${siteName}`,
          data: result
        };
      } else {
        warn(`Failed to restart some processes for site: ${siteName}`);
        return {
          success: false,
          message: `Failed to restart some processes for site: ${siteName}`,
          data: result
        };
      }
    }
  } catch (err) {
    error(`Error restarting site ${siteName}: ${err}`);
    return {
      success: false,
      message: `Error restarting site: ${err}`,
      data: { error: err }
    };
  }
}
