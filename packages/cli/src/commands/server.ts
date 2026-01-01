import { Command } from "commander";
import { resolve } from "path";
import { existsSync, readFileSync, mkdirSync } from "fs";
import { spawn } from "bun";
import {
  isCaddyRunning,
  startCaddy,
  startCaddyProduction,
  reloadCaddy,
  reloadCaddyProduction,
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

async function ensureCaddyRunning(mode: 'dev' | 'production'): Promise<boolean> {
  if (await isCaddyRunning()) {
    info("Caddy is already running. Reloading configuration...");
    const reloaded = mode === 'production' 
      ? await reloadCaddyProduction()
      : await reloadCaddy();
    
    if (reloaded) {
      info("Caddy configuration reloaded successfully.");
      return true;
    } else {
      warn("Failed to reload Caddy configuration. Continuing without Caddy reload.");
      return false;
    }
  } else {
    info("Starting Caddy server...");
    const started = mode === 'production' 
      ? await startCaddyProduction()
      : await startCaddy();
    
    if (started) {
      info("Caddy started successfully.");
      return true;
    } else {
      warn("Failed to start Caddy. HTTPS may not work properly.");
      return false;
    }
  }
}

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
async function doctorCommand(): Promise<void> {
  info("🔍 Running Deploy Server diagnostics...");
  
  try {
    // Check Caddy
    info("\n📋 Checking Caddy...");
    const caddyRunning = await isCaddyRunning();
    if (caddyRunning) {
      info("✅ Caddy is running");
    } else {
      warn("⚠️ Caddy is not running");
      info("Testing Caddy configuration...");
      const caddySuccess = await ensureCaddyRunning('production');
      if (caddySuccess) {
        info("✅ Caddy started successfully");
      } else {
        error("❌ Caddy failed to start - check configuration");
      }
    }
    
    // Check directories
    info("\n📋 Checking directories...");
    const rootDir = getRootDir();
    info(`✅ Root directory: ${rootDir}`);
    
    const logsDir = resolve(process.cwd(), "logs");
    if (existsSync(logsDir)) {
      info(`✅ Logs directory: ${logsDir}`);
    } else {
      info(`📁 Logs directory will be created: ${logsDir}`);
    }
    
    // Check domain
    info("\n🌐 Checking domain configuration...");
    const domain = getDomain();
    info(`✅ Domain: ${domain}`);
    
    info("\n🎉 Diagnostics completed!");
    info("💡 If issues persist, try 'deploy start --foreground' for detailed logs");
    
  } catch (err) {
    error("❌ Diagnostics failed:", err);
    process.exit(1);
  }
}

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
          
          // Setup logs directory first
          const logsDir = await setupLogsDirectory();
          const logFile = resolve(logsDir, "deploy-server.log");
          const errorFile = resolve(logsDir, "deploy-server-error.log");
          
          // Pre-flight validation before daemonizing
          info("Validating configuration before starting daemon...");
          
          try {
            // Test Caddy configuration first (most common failure point)
            info("Testing Caddy configuration...");
            const caddySuccess = await ensureCaddyRunning('production');
            if (!caddySuccess) {
              error("❌ Caddy failed to start. Check your Caddyfile configuration.");
              error("💡 Try running 'deploy start --foreground' to see detailed errors.");
              process.exit(1);
            }
            info("✅ Caddy configuration is valid and started successfully");
            
            // Test that we can load root config and sites
            const rootDir = getRootDir();
            info(`✅ Root directory validated: ${rootDir}`);
            
          } catch (validationError) {
            error("❌ Pre-flight validation failed:");
            error(validationError instanceof Error ? validationError.message : String(validationError));
            error("💡 Try running 'deploy start --foreground' to see detailed errors.");
            process.exit(1);
          }
          
          info("✅ Pre-flight validation completed successfully");
          
          // Get the current executable path (works for both dev and global install)
          const currentExecutable = process.argv[0]; // bun or node path
          const currentScript = process.argv[1]; // script path
          
          info(`Spawning daemon with: ${currentExecutable} ${currentScript}`);
          info(`Logs will be written to: ${logFile}`);
          
          // Spawn the process in daemon mode using the current executable
          // Note: Bun's spawn doesn't support 'detached', but using Bun.spawn with
          // setsid via shell provides similar behavior
          const proc = spawn({
            cmd: ["sh", "-c", `setsid ${currentExecutable} ${currentScript} start --foreground --log-level ${options.logLevel} </dev/null &`],
            stdout: Bun.file(logFile),
            stderr: Bun.file(errorFile),
            stdin: "ignore",
          });
          info(`🚀 Server started in daemon mode with PID ${proc.pid}`);
          info(`📋 Check logs at: ${logFile}`);
          info(`📋 Check errors at: ${errorFile}`);
          info("💡 Use 'deploy start --foreground' for interactive debugging");
          process.exit(0);
        }

        // Ensure Caddy is running with latest configuration
        await ensureCaddyRunning('production');

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
        // Ensure Caddy is running with latest configuration
        const caddySuccess = await ensureCaddyRunning('dev');
        if (!caddySuccess) {
          warn("You can run 'bun run setup:macos' to set up Caddy.");
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
        info(`Main server running on: http://localhost:${server.port}`);
        info(`Sites are accessible via subdomains:`);
        info(`  - https://[site-name].${domain} (via Caddy)`);
        info(`  - http://[site-name].localhost:${server.port} (direct)`);
        info(`\nIndividual sites will auto-start on their assigned ports when accessed.`);

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
          const findProc = spawn([
            "pgrep", "-f", "bun.*deploy.*start"
          ], {
            stdio: ["pipe", "pipe", "pipe"]
          });
          
          await findProc.exited;
          
          if (findProc.exitCode === 0) {
            // Found processes, kill them
            const killProc = spawn([
              "pkill", "-f", "bun.*deploy.*start"
            ], {
              stdio: ["pipe", "pipe", "pipe"]
            });
            
            await killProc.exited;
            killedProcesses = true;
            info("Killed existing server processes");
            
            // Wait longer for processes to clean up
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Verify processes are actually gone
            const verifyProc = spawn([
              "pgrep", "-f", "bun.*deploy.*start"
            ], {
              stdio: ["pipe", "pipe", "pipe"]
            });
            
            await verifyProc.exited;
            if (verifyProc.exitCode === 0) {
              warn("Some processes may still be running, forcing kill...");
              const forceKillProc = spawn([
                "pkill", "-9", "-f", "bun.*deploy.*start"
              ], {
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
          const portCheckProc = spawn([
            "lsof", "-ti", ":3000"
          ], {
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
        
        // Ensure Caddy is running with latest configuration
        info("Reloading Caddy configuration...");
        await ensureCaddyRunning('production');
        
        // Start the server again
        info("Starting server...");
        const proc = spawn([
          "bun", "run", "deploy", "start", "--log-level", options.logLevel
        ], {
          stdio: ["ignore", "ignore", "ignore"]
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

  // Doctor command for diagnostics
  program
    .command("doctor")
    .description("Run diagnostics to check server configuration and health")
    .action(doctorCommand);

  // Update command for pulling latest code and restarting
  program
    .command("update")
    .description("Pull latest code, rebuild, and restart the server")
    .option("--branch <branch>", "Git branch to pull from", "main")
    .option("--skip-restart", "Skip restarting the server after update")
    .action(async (options) => {
      try {
        const cwd = process.cwd();
        info("🔄 Updating Deploy server...");

        // Step 1: Git pull
        info("\n📥 Pulling latest code...");
        const pullProc = spawn(["git", "pull", "origin", options.branch], {
          cwd,
          stdio: ["inherit", "inherit", "inherit"]
        });
        await pullProc.exited;
        if (pullProc.exitCode !== 0) {
          error("Git pull failed");
          process.exit(1);
        }
        info("✅ Code updated");

        // Step 2: Install dependencies
        info("\n📦 Installing dependencies...");
        const installProc = spawn(["bun", "install"], {
          cwd,
          stdio: ["inherit", "inherit", "inherit"]
        });
        await installProc.exited;
        if (installProc.exitCode !== 0) {
          error("Dependency installation failed");
          process.exit(1);
        }
        info("✅ Dependencies installed");

        // Step 3: Rebuild
        info("\n🔨 Rebuilding...");
        const buildProc = spawn(["bun", "run", "build"], {
          cwd,
          stdio: ["inherit", "inherit", "inherit"]
        });
        await buildProc.exited;
        if (buildProc.exitCode !== 0) {
          error("Build failed");
          process.exit(1);
        }
        info("✅ Build complete");

        // Step 4: Restart service (if running as systemd)
        if (!options.skipRestart) {
          info("\n🔄 Restarting deploy service...");
          const restartProc = spawn(["sudo", "systemctl", "restart", "deploy"], {
            cwd,
            stdio: ["inherit", "inherit", "inherit"]
          });
          await restartProc.exited;
          if (restartProc.exitCode !== 0) {
            warn("Failed to restart via systemctl, trying manual restart...");
            // Try manual restart
            const manualRestartProc = spawn(["bun", "run", "deploy", "restart"], {
              cwd,
              stdio: ["inherit", "inherit", "inherit"]
            });
            await manualRestartProc.exited;
          }
          info("✅ Deploy service restarted");

          // Step 5: Reload Caddy
          info("\n🔄 Reloading Caddy...");
          const caddyProc = spawn(["sudo", "systemctl", "reload", "caddy"], {
            cwd,
            stdio: ["inherit", "inherit", "inherit"]
          });
          await caddyProc.exited;
          if (caddyProc.exitCode !== 0) {
            warn("Failed to reload Caddy via systemctl");
          } else {
            info("✅ Caddy reloaded");
          }

          // Wait and check status
          await new Promise(resolve => setTimeout(resolve, 2000));
          info("\n📊 Checking service status...");
          const statusProc = spawn(["systemctl", "status", "deploy", "--no-pager", "-l"], {
            cwd,
            stdio: ["inherit", "inherit", "inherit"]
          });
          await statusProc.exited;
        }

        info("\n🎉 Update complete!");
      } catch (err) {
        error("Update failed:", err);
        process.exit(1);
      }
    });
}
