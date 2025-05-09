
import { Command } from "commander";
import { resolve } from "path";
import { existsSync, readFileSync, mkdirSync } from "fs";
import {
  isCaddyRunning,
  startCaddy,
  startCaddyProduction,
  getDomain
} from "../utils/caddy";
import { debug, info, error, warn, LogLevel } from "@dialup-deploy/core";

/**
 * Register the server commands
 */
export function registerServerCommands(program: Command): void {
  // Start command (production mode)
  program
    .command("start")
    .description("Start the server in production mode (starts Caddy if needed)")
    .option(
      "--log-level <level>",
      "Set logging level (0=none, 1=error, 2=warn, 3=info, 4=debug)",
      "3"
    )
    .action(async (options) => {
      try {
        // Start Caddy if needed
        if (!(await isCaddyRunning())) {
          await startCaddyProduction();
        } else {
          info("Caddy is already running.");
        }

        // Start the server
        info("Starting server in production mode...");

        // Create logs directory if it doesn't exist
        const logsDir = resolve(process.cwd(), "logs");
        if (!existsSync(logsDir)) {
          mkdirSync(logsDir, { recursive: true });
        }

        const { startServer } = await import("@dialup-deploy/server");
        // Ensure rootDir is properly resolved
        const rootDir = process.env.ROOT_DIR
          ? resolve(process.env.ROOT_DIR)
          : resolve(__dirname, "../../../../sites");

        debug(`Using root directory: ${rootDir}`);
        const logLevel = parseInt(options.logLevel);
        const server = await startServer("serve", { rootDir, logLevel });

        info(`Server is now active and ready to handle requests`);
        info(`Logs are being written to: ${logsDir}`);

        // Handle graceful shutdown
        process.on("SIGINT", () => {
          info("Shutting down server...");
          process.exit(0);
        });
      } catch (err) {
        error("Failed to start server:", err);
        process.exit(1);
      }
    });

  // Dev command (development mode)
  program
    .command("dev")
    .description(
      "Start the server in development mode (starts Caddy if needed)"
    )
    .option(
      "--log-level <level>",
      "Set logging level (0=none, 1=error, 2=warn, 3=info, 4=debug)",
      "3"
    )
    .action(async (options) => {
      try {
        // Start Caddy if needed
        if (!(await isCaddyRunning())) {
          info("Starting Caddy server for HTTPS support...");
          const caddyStarted = await startCaddy();
          if (!caddyStarted) {
            warn("Failed to start Caddy. HTTPS may not work properly.");
            warn("You can run 'bun run setup:macos' to set up Caddy.");
          }
        } else {
          info("Caddy is already running.");
        }

        // Start the server
        info("Starting server in development mode...");

        // Create logs directory if it doesn't exist
        const logsDir = resolve(process.cwd(), "logs");
        if (!existsSync(logsDir)) {
          mkdirSync(logsDir, { recursive: true });
        }

        const { startServer } = await import("@dialup-deploy/server");
        // Ensure rootDir is properly resolved
        const rootDir = process.env.ROOT_DIR
          ? resolve(process.env.ROOT_DIR)
          : resolve(__dirname, "../../../../sites");

        debug(`Using root directory: ${rootDir}`);
        const logLevel = parseInt(options.logLevel);
        const server = await startServer("dev", { rootDir, logLevel });

        // Get domain from .env
        const domain = await getDomain();

        info(`Development server is now active and ready to handle requests`);
        info(`You can access your sites at:`);
        info(`  - http://localhost:${server.port}`);
        info(`  - https://${domain}`);
        info(`  - https://[site].${domain}`);

        // Handle graceful shutdown
        process.on("SIGINT", () => {
          info("Shutting down development server...");
          process.exit(0);
        });
      } catch (err) {
        error("Failed to start development server:", err);
        process.exit(1);
      }
    });
}
