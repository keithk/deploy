import { createServer } from "./createServer";
import { discoverSites } from "./discoverSites";
import { info, LogLevel } from "@dialup-deploy/core";
import {
  processManager as actionsProcessManager,
  setServerExecuteCommand
} from "@dialup-deploy/actions";
import { processManager } from "./utils/process-manager";

// Initialize the actions package with the server's process manager
actionsProcessManager.setServerProcessManager(processManager);

// Initialize the actions package with the server's executeCommand function
import { executeCommand as serverExecuteCommand } from "./actions";
setServerExecuteCommand(serverExecuteCommand);

// Export server creation function
export async function startServer(
  mode: "serve" | "dev" = "serve",
  options?: { rootDir?: string; port?: number; logLevel?: LogLevel }
) {
  const port = options?.port ?? parseInt(process.env.PORT || "3000", 10);
  const rootDir = options?.rootDir ?? process.env.ROOT_DIR ?? "/sites";
  const logLevel =
    options?.logLevel ??
    (process.env.LOG_LEVEL
      ? (parseInt(process.env.LOG_LEVEL) as LogLevel)
      : LogLevel.WARN);

  const server = await createServer({ mode, rootDir, port, logLevel });

  info(`Server started in ${mode} mode on port ${port}`);

  return { server, port };
}

// Export other utilities
export { discoverSites };

// Re-export action utilities from the server
export {
  actionRegistry,
  loadRootConfig,
  discoverActions,
  initializeGitHubAction
} from "./actions";

// Export types
export type { ActionRegistry } from "./actions/registry";

// Re-export logging utilities from core
export { LogLevel, setLogLevel } from "@dialup-deploy/core";

// Re-export everything from the actions package
export * from "@dialup-deploy/actions";
