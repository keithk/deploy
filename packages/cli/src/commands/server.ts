import { Command } from "commander";
import { resolve } from "path";
import { existsSync, readFileSync, mkdirSync } from "fs";
import { spawn } from "bun";
import {
  isCaddyRunning,
  startCaddy,
  startCaddyProduction,
  getDomain
} from "../utils/caddy";
import {
  debug,
  info,
  error,
  warn,
  LogLevel,
  processModel
} from "@keithk/deploy-core";
import { startServer } from "@keithk/deploy-server";
import { processManager } from "@keithk/deploy-server/src/utils/process-manager";

async function restartProcesses() {
  info("Checking for processes to restart...");
  try {
    const runningProcesses = processModel.getByStatus("running");
    if (runningProcesses.length > 0) {
      info(`Found ${runningProcesses.length} processes to restart`);

      for (const proc of runningProcesses) {
        info(
          `Restarting process ${proc.id} (${proc.site} on port ${proc.port})`
        );
        const success = await processManager.startProcess(
          proc.site,
          proc.port,
          proc.script,
          proc.cwd,
          proc.type,
          {} // We don't store env variables in the database for security reasons
        );

        if (success) {
          info(`Successfully restarted process ${proc.id}`);
        } else {
          warn(`Failed to restart process ${proc.id}`);
        }
      }
    } else {
      info("No processes found to restart");
    }
  } catch (err) {
    warn("Error restarting processes:", err);
  }
}

async function setupLogsDirectory() {
  const logsDir = resolve(process.cwd(), "logs");
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

function getRootDir() {
  return process.env.ROOT_DIR
    ? resolve(process.env.ROOT_DIR)
    : resolve(__dirname, "../../../../sites");
}

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
    .option(
      "--daemon",
      "Run server in daemon mode (background process)",
      true
    )
    .option(
      "--foreground",
      "Run server in foreground mode (opposite of daemon)"
    )
    .action(async (options) => {
      try {
        // Handle daemon vs foreground mode
        const isDaemon = options.foreground ? false : options.daemon;
        
        if (isDaemon) {
          info("Starting server in daemon mode...");
          
          // Spawn the process in daemon mode using Bun
          const proc = spawn({
            cmd: ["bun", "run", "deploy", "start", "--foreground", "--log-level", options.logLevel],
            stdio: ["ignore", "ignore", "ignore"],
            detached: true
          });
          
          proc.unref();
          info(`Server started in daemon mode with PID ${proc.pid}`);
          process.exit(0);
        }

        // Start Caddy if needed
        if (!(await isCaddyRunning())) {
          await startCaddyProduction();
        } else {
          info("Caddy is already running.");
        }

        // Start the server
        info("Starting server in production mode...");

        const logsDir = await setupLogsDirectory();
        const rootDir = getRootDir();

        debug(`Using root directory: ${rootDir}`);
        const logLevel = parseInt(options.logLevel);
        const server = await startServer("serve", { rootDir, logLevel });

        await restartProcesses();

        info(`Server is now active and ready to handle requests`);
        info(`Logs are being written to: ${logsDir}`);

        // Only handle graceful shutdown in foreground mode
        if (!isDaemon) {
          process.on("SIGINT", () => {
            info("Shutting down server...");
            process.exit(0);
          });
        }
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

        const { startServer } = await import("@keithk/deploy-server");
        // Ensure rootDir is properly resolved
        const rootDir = process.env.ROOT_DIR
          ? resolve(process.env.ROOT_DIR)
          : resolve(__dirname, "../../../../sites");

        debug(`Using root directory: ${rootDir}`);
        const logLevel = parseInt(options.logLevel);
        const server = await startServer("dev", { rootDir, logLevel });

        // Get domain from .env
        const domain = await getDomain();

        // Restart any processes that were running before
        info("Checking for processes to restart...");
        try {
          const runningProcesses = processModel.getByStatus("running");
          if (runningProcesses.length > 0) {
            info(`Found ${runningProcesses.length} processes to restart`);

            // Import the process manager directly from the utils
            const { processManager } = await import(
              "@keithk/deploy-server/src/utils/process-manager"
            );

            // Restart each process
            for (const proc of runningProcesses) {
              info(
                `Restarting process ${proc.id} (${proc.site} on port ${proc.port})`
              );
              const success = await processManager.startProcess(
                proc.site,
                proc.port,
                proc.script,
                proc.cwd,
                proc.type,
                {} // We don't store env variables in the database for security reasons
              );

              if (success) {
                info(`Successfully restarted process ${proc.id}`);
              } else {
                warn(`Failed to restart process ${proc.id}`);
              }
            }
          } else {
            info("No processes found to restart");
          }
        } catch (err) {
          warn("Error restarting processes:", err);
        }

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

  // Restart command
  program
    .command("restart")
    .description("Restart the server (kills any running processes and starts fresh)")
    .option(
      "--log-level <level>",
      "Set logging level (0=none, 1=error, 2=warn, 3=info, 4=debug)",
      "3"
    )
    .option(
      "--graceful",
      "Gracefully shutdown site processes before restarting server",
      false
    )
    .option(
      "--timeout <seconds>",
      "Timeout for graceful shutdown in seconds",
      "30"
    )
    .action(async (options) => {
      try {
        info("Restarting server...");
        
        // If graceful restart is requested, shutdown site processes first
        if (options.graceful) {
          try {
            info("Gracefully shutting down site processes...");
            const { processManager } = await import(
              "@keithk/deploy-server/src/utils/process-manager"
            );
            
            const timeout = parseInt(options.timeout) * 1000;
            await processManager.shutdownAll(timeout);
            info("Site processes shutdown completed");
          } catch (err) {
            warn("Error during graceful shutdown, proceeding with force restart:", err);
          }
        }
        
        // Kill any existing deploy server processes
        let killedProcesses = false;
        try {
          // First try to find deploy processes more precisely
          const findProc = spawn({
            cmd: ["pgrep", "-f", "bun.*deploy.*start"],
            stdio: ["pipe", "pipe", "pipe"]
          });
          
          await findProc.exited;
          
          if (findProc.exitCode === 0) {
            // Found processes, kill them
            const killProc = spawn({
              cmd: ["pkill", "-f", "bun.*deploy.*start"],
              stdio: ["pipe", "pipe", "pipe"]
            });
            
            await killProc.exited;
            killedProcesses = true;
            info("Killed existing server processes");
            
            // Wait longer for processes to clean up
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Verify processes are actually gone
            const verifyProc = spawn({
              cmd: ["pgrep", "-f", "bun.*deploy.*start"],
              stdio: ["pipe", "pipe", "pipe"]
            });
            
            await verifyProc.exited;
            if (verifyProc.exitCode === 0) {
              warn("Some processes may still be running, forcing kill...");
              const forceKillProc = spawn({
                cmd: ["pkill", "-9", "-f", "bun.*deploy.*start"],
                stdio: ["pipe", "pipe", "pipe"]
              });
              await forceKillProc.exited;
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        } catch (err) {
          debug("Process cleanup error (this may be normal):", err);
        }
        
        if (!killedProcesses) {
          info("No existing server processes found to kill");
        }
        
        // Verify no processes are using our expected ports
        try {
          const portCheckProc = spawn({
            cmd: ["lsof", "-ti", ":3000"],
            stdio: ["pipe", "pipe", "pipe"]
          });
          
          await portCheckProc.exited;
          if (portCheckProc.exitCode === 0) {
            warn("Port 3000 is still in use, waiting for it to be freed...");
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (err) {
          debug("Port check completed");
        }
        
        // Start the server again
        info("Starting server...");
        const proc = spawn({
          cmd: ["bun", "run", "deploy", "start", "--log-level", options.logLevel],
          stdio: ["ignore", "ignore", "ignore"],
          detached: true
        });
        
        proc.unref();
        info(`Server restarted successfully with PID ${proc.pid}`);
        
        // Brief wait to check if server started successfully
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify the server is still running
        try {
          if (proc.pid) {
            process.kill(proc.pid, 0); // Signal 0 just checks if process exists
            info("Server startup verified - process is running");
          }
        } catch (err) {
          error("Server may have failed to start - please check logs");
        }
        
        process.exit(0);
      } catch (err) {
        error("Failed to restart server:", err);
        process.exit(1);
      }
    });
}
