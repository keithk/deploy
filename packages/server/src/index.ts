
import { createServer } from "./createServer";
import { discoverSites } from "./discoverSites";
import { info, LogLevel } from "@dialup-deploy/core";

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

// Re-export action utilities
export {
  actionRegistry,
  loadRootConfig,
  discoverActions,
  initializeGitHubAction,
  executeCommand,
  restartSite
} from "./actions";

// Export types
export type { ActionRegistry } from "./actions/registry";

// Re-export logging utilities from core
export { LogLevel, setLogLevel } from "@dialup-deploy/core";
