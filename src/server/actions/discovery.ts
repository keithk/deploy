import { join, resolve, basename, dirname } from "path";
import { existsSync, readdirSync } from "fs";
import type { SiteConfig } from "../core";
import type {
  Action,
  ActionContext,
  RootActionConfig,
  SiteActionConfig,
  ScheduledActionConfig,
  WebhookActionConfig
} from "../core";
import { DEPLOY_PATHS, LEGACY_PATHS } from "../../core/config/paths";
// Using Bun.spawn instead of child_process.spawnSync
import {
  loadBuildCache,
  needsRebuild,
  updateBuildCache,
  debug,
  error,
  info,
  warn
} from "../../core";
import { loadEnvFile } from "../utils";

/**
 * Load the root configuration file
 * @returns The root configuration or an empty object if not found
 */
export async function loadRootConfig(): Promise<RootActionConfig> {
  // Get the project root directory
  // First check if ROOT_DIR is set in environment
  const rootDir = process.env.ROOT_DIR
    ? resolve(process.env.ROOT_DIR, "..") // Go up one level from sites directory
    : resolve(process.cwd(), "../.."); // Default fallback

  info(`Current working directory: ${process.cwd()}`);
  info(`Project root directory: ${rootDir}`);

  // Look for deploy.json in the new .deploy directory first
  const newConfigPath = DEPLOY_PATHS.rootConfig;
  info(`Looking for root config at: ${newConfigPath}`);

  if (existsSync(newConfigPath)) {
    try {
      debug(`Root config file found at ${newConfigPath}, loading...`);
      const configContent = await Bun.file(newConfigPath).text();
      const config = JSON.parse(configContent);
      debug(`Root config loaded:`, config);
      return config;
    } catch (err) {
      error(
        `Error loading root config from ${newConfigPath}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // Check for legacy location and migrate if found
  const legacyConfigPath = LEGACY_PATHS.oldRootConfig;
  if (existsSync(legacyConfigPath)) {
    info(`Found root config at legacy location ${legacyConfigPath}, migrating...`);
    try {
      const configContent = await Bun.file(legacyConfigPath).text();
      const config = JSON.parse(configContent);
      
      // Ensure the .deploy directory exists
      await Bun.write(join(DEPLOY_PATHS.deployDir, '.gitkeep'), '');
      
      // Write to new location
      await Bun.write(newConfigPath, configContent);
      info(`Root config migrated to ${newConfigPath}`);
      
      // Remove legacy file
      const proc = Bun.spawn(['rm', legacyConfigPath], { stdio: ['ignore', 'ignore', 'ignore'] });
      await proc.exited;
      
      debug(`Root config loaded from migrated file:`, config);
      return config;
    } catch (err) {
      error(
        `Error migrating root config from ${legacyConfigPath}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  debug(`No root config file found.`);
  return {};
}

/**
 * Load site-specific action configuration
 * @param sitePath Path to the site directory
 * @returns The site action configuration or null if not found
 */
export async function loadSiteActionConfig(
  sitePath: string
): Promise<SiteActionConfig | null> {
  // First try the preferred location (.deploy/config.json)
  const preferredConfigPath = join(sitePath, ".deploy", "config.json");

  if (existsSync(preferredConfigPath)) {
    try {
      debug(`Loading site action config from preferred location: ${preferredConfigPath}`);
      const configContent = await Bun.file(preferredConfigPath).text();
      const config = JSON.parse(configContent);

      // If the config has an actions property, return it as the site action config
      if (config.actions) {
        return { actions: config.actions };
      }
    } catch (err) {
      error(
        `Error loading site action config from ${preferredConfigPath}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // Fall back to deploy.json
  const fallbackConfigPath = join(sitePath, "deploy.json");

  if (existsSync(fallbackConfigPath)) {
    try {
      debug(
        `Loading site action config from fallback location: ${fallbackConfigPath}`
      );
      const configContent = await Bun.file(fallbackConfigPath).text();
      const config = JSON.parse(configContent);

      // If the config has an actions property, return it as the site action config
      if (config.actions) {
        return { actions: config.actions };
      }
    } catch (err) {
      error(
        `Error loading site action config from ${fallbackConfigPath}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return null;
}

/**
 * Execute a command in a specific directory using Bun.spawn
 * @param command The command to execute
 * @param options Options for command execution
 * @returns Result of the command execution
 */
export async function executeCommand(
  command: string,
  options: { cwd: string; env?: Record<string, string> }
): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    // Split the command into the executable and arguments
    const parts = command.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);

    info(`Executing command: ${command} in ${options.cwd}`);

    // Ensure cmd is a string
    if (!cmd) {
      return {
        success: false,
        message: "Invalid command: empty command string"
      };
    }

    // Use Bun.spawn instead of spawnSync
    const proc = Bun.spawn([cmd, ...args], {
      cwd: options.cwd,
      // Only use the provided environment if it's specified
      // Otherwise, fall back to process.env
      env:
        options.env && Object.keys(options.env).length > 0
          ? options.env
          : process.env,
      stdout: "pipe",
      stderr: "pipe"
    });

    // Collect stdout and stderr
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    // Wait for process to exit and get exit code
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return {
        success: false,
        message: `Command exited with code ${exitCode}`,
        data: { stdout, stderr }
      };
    }

    return {
      success: true,
      message: "Command executed successfully",
      data: { stdout, stderr }
    };
  } catch (error) {
    return {
      success: false,
      message: `Error executing command: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
}

/**
 * Build a specific site
 * @param site The site configuration
 * @param context The action context
 * @returns Result of the build operation
 */
export async function buildSite(
  site: SiteConfig,
  context: ActionContext
): Promise<{ success: boolean; message: string }> {
  if (site.type !== "static-build" || !site.commands?.build) {
    return {
      success: false,
      message: `Site ${site.subdomain} is not a static-build site or has no build command`
    };
  }

  // Load build cache
  const buildCache = loadBuildCache();

  // Check if site needs rebuilding
  if (!needsRebuild(site, buildCache)) {
    return {
      success: true,
      message: `Site ${site.subdomain} is already up to date, skipping build`
    };
  }

  // Determine package manager
  let packageManager = "bun";
  const siteName = basename(site.path);

  // Detect package manager by lock files
  if (existsSync(join(site.path, "bun.lock"))) {
    packageManager = "bun";
  } else if (existsSync(join(site.path, "yarn.lock"))) {
    packageManager = "yarn";
  } else if (existsSync(join(site.path, "pnpm-lock.yaml"))) {
    packageManager = "pnpm";
  } else if (existsSync(join(site.path, "package-lock.json"))) {
    packageManager = "npm";
  }

  // Define command and args based on package manager
  const command =
    packageManager === "bun"
      ? "bun"
      : packageManager === "yarn"
      ? "yarn"
      : packageManager === "pnpm"
      ? "pnpm"
      : "npm";

  const args = packageManager === "yarn" ? ["build"] : ["run", "build"];
  const cmdString = `${command} ${args.join(" ")}`;

  // Load site-specific environment variables if available
  let env: Record<string, string> = { DEPLOY_ACTION: "true" };

  // If this is being called from a site-specific action, use its environment
  if (context.env) {
    env = { ...context.env, DEPLOY_ACTION: "true" };
  } else {
    // Otherwise, try to load the site's .env file
    try {
      const envPath = join(site.path, ".env");
      if (existsSync(envPath)) {
        debug(`Loading site-specific environment for build from ${envPath}`);
        const siteEnv = await loadEnvFile(envPath);
        env = { ...siteEnv, DEPLOY_ACTION: "true" };
      }
    } catch (err) {
      debug(`Error loading site environment for build: ${err}`);
    }
  }

  // Execute build command with site-specific environment
  const result = await executeCommand(cmdString, {
    cwd: site.path,
    env
  });

  if (result.success) {
    // Update build cache
    updateBuildCache(site, buildCache);
    return {
      success: true,
      message: `Successfully built site ${site.subdomain}`
    };
  } else {
    return {
      success: false,
      message: `Failed to build site ${site.subdomain}: ${result.message}`
    };
  }
}

/**
 * Create an action for a site-specific scheduled command
 * @param siteConfig The site configuration
 * @param actionConfig The action configuration
 * @returns The created action
 */
export function createSiteAction(
  siteConfig: SiteConfig,
  actionConfig: ScheduledActionConfig | WebhookActionConfig
): Action {
  return {
    id: `${siteConfig.subdomain}-${actionConfig.id}`,
    type: actionConfig.type,
    siteId: siteConfig.subdomain,
    config: actionConfig,
    async handler(payload, context) {
      if (actionConfig.type === "scheduled") {
        // Use site-specific environment variables if available
        const env = context.env || { DEPLOY_ACTION: "true" };

        // Execute the command in the site directory
        const result = await executeCommand(actionConfig.command, {
          cwd: siteConfig.path,
          env
        });

        // Trigger build if specified and command was successful
        if (actionConfig.triggerBuild && result.success) {
          const buildResult = await buildSite(siteConfig, context);

          return {
            success: buildResult.success && result.success,
            message: `Command: ${result.message}, Build: ${buildResult.message}`,
            data: result.data
          };
        }

        return {
          success: result.success,
          message: result.message,
          data: result.data
        };
      } else if (actionConfig.type === "webhook") {
        // For webhook actions, we'll implement specific handlers later
        return {
          success: false,
          message: "Site-specific webhook actions not yet implemented"
        };
      }

      return {
        success: false,
        message: `Unknown action type: ${(actionConfig as any).type}`
      };
    }
  };
}

/**
 * Discover TypeScript actions in a directory
 * @param directory The directory to search for actions
 * @param siteId Optional site ID for site-specific actions
 * @returns Array of discovered actions
 */
export async function discoverTypeScriptActions(
  directory: string,
  siteId?: string
): Promise<Action[]> {
  const actions: Action[] = [];

  // First check the preferred location (.deploy/actions)
  const preferredActionsDir = join(directory, ".deploy", "actions");

  if (existsSync(preferredActionsDir)) {
    try {
      // Get all .ts files in the preferred actions directory
      const files = readdirSync(preferredActionsDir)
        .filter((file) => file.endsWith(".ts") || file.endsWith(".js"))
        .map((file) => join(preferredActionsDir, file));

      debug(`Found ${files.length} potential action files in ${preferredActionsDir}`);

      // Import each file and check if it exports an action
      for (const file of files) {
        try {
          // Import the file
          const module = await import(file);

          // Check if it exports a default that looks like an action
          if (
            module.default &&
            typeof module.default === "object" &&
            module.default.id &&
            module.default.handler
          ) {
            const action = module.default as Action;

            // Add the siteId if this is a site-specific action
            if (siteId && !action.siteId) {
              action.siteId = siteId;
            }

            debug(
              `Discovered TypeScript action: ${action.id} (${action.type}) from ${file}`
            );
            actions.push(action);
          } else {
            warn(`File ${file} does not export a valid action`);
          }
        } catch (err) {
          error(
            `Error importing action from ${file}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    } catch (err) {
      error(
        `Error reading actions directory ${preferredActionsDir}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // Then check the legacy location (actions)
  const legacyActionsDir = join(directory, "actions");

  if (!existsSync(legacyActionsDir)) {
    if (actions.length === 0) {
      debug(
        `No actions directory found at ${legacyActionsDir} or ${preferredActionsDir}`
      );
    }
    return actions;
  }

  try {
    // Get all .ts files in the legacy actions directory
    const files = readdirSync(legacyActionsDir)
      .filter((file) => file.endsWith(".ts") || file.endsWith(".js"))
      .map((file) => join(legacyActionsDir, file));

    debug(
      `Found ${files.length} potential action files in ${legacyActionsDir}`
    );

    // Import each file and check if it exports an action
    for (const file of files) {
      try {
        // Import the file
        const module = await import(file);

        // Check if it exports a default that looks like an action
        if (
          module.default &&
          typeof module.default === "object" &&
          module.default.id &&
          module.default.handler
        ) {
          const action = module.default as Action;

          // Add the siteId if this is a site-specific action
          if (siteId && !action.siteId) {
            action.siteId = siteId;
          }

          debug(
            `Discovered TypeScript action: ${action.id} (${action.type}) from ${file}`
          );
          actions.push(action);
        } else {
          warn(`File ${file} does not export a valid action`);
        }
      } catch (err) {
        error(
          `Error importing action from ${file}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  } catch (err) {
    error(
      `Error reading actions directory ${legacyActionsDir}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  return actions;
}

/**
 * Discover all actions from root config, site-specific configs, and TypeScript files
 * @param rootDir The root directory for sites
 * @param sites Array of site configurations
 * @returns Array of discovered actions
 */
export async function discoverActions(
  rootDir: string,
  sites: SiteConfig[]
): Promise<Action[]> {
  const actions: Action[] = [];

  // 1. Discover root-level actions from TypeScript files
  const rootLevelActions = await discoverTypeScriptActions(dirname(rootDir));
  actions.push(...rootLevelActions);

  // 2. Discover site-specific actions
  for (const site of sites) {
    // 2.1 Discover from config.json (legacy)
    const siteConfig = await loadSiteActionConfig(site.path);

    if (siteConfig && siteConfig.actions) {
      for (const actionConfig of siteConfig.actions) {
        const action = createSiteAction(site, actionConfig);
        actions.push(action);
      }
    }

    // 2.2 Discover from TypeScript files
    const siteActions = await discoverTypeScriptActions(
      site.path,
      site.subdomain
    );
    actions.push(...siteActions);
  }

  return actions;
}
