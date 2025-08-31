import { Command } from "commander";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import chalk from "chalk";
import { processModel, info, error as logError } from "../../core";

interface ProcessInfo {
  id: string;
  site: string;
  port: number;
  status: string;
  uptime: number;
  pid?: number;
  resources?: {
    cpu: number;
    memory: number;
    memoryMB: number;
  };
  healthChecks?: {
    total: number;
    failed: number;
    consecutiveFailed: number;
    lastCheck?: Date;
  };
  restartCount?: number;
}

/**
 * Register the processes command
 */
export function registerProcessesCommand(program: Command): void {
  const processesCommand = program
    .command("processes")
    .alias("ps")
    .description("Manage running processes for dynamic and passthrough sites");

  // List processes (default command)
  processesCommand
    .command("list")
    .alias("ls")
    .description("List all running processes")
    .option("--all", "Show all processes, including stopped ones", false)
    .option("--json", "Output as JSON", false)
    .option("--health", "Show health check information", false)
    .option("--resources", "Show CPU and memory usage", false)
    .option("--watch", "Watch and update in real-time", false)
    .action(async (options) => {
      try {
        const { processManager } = await import(
          "../../server/utils/process-manager"
        );
        
        // Get live process information from the process manager
        const liveProcesses = processManager.getProcesses();
        
        // Also get database information for additional context
        const dbProcesses = processModel.getAll();
        
        // Merge information
        const processes: ProcessInfo[] = liveProcesses.map(proc => {
          const dbProc = dbProcesses.find(p => p.id === proc.id);
          return {
            ...proc,
            pid: dbProc?.pid
          };
        });

        // Filter processes if --all is not specified
        const filteredProcesses = options.all
          ? processes
          : processes.filter(
              (p) => p.status === "running" || p.status === "unhealthy"
            );

        if (options.json) {
          console.log(JSON.stringify(filteredProcesses, null, 2));
          return;
        }

        if (filteredProcesses.length === 0) {
          console.log(chalk.yellow("No processes are currently running."));
          console.log("\nUse 'deploy site create' to create a new site");
          return;
        }

        console.log(chalk.bold("\n🔄 Process Status"));
        console.log("=================\n");

        filteredProcesses.forEach((proc) => {
          const statusColor = getStatusColor(proc.status);
          const status = statusColor(proc.status.toUpperCase());

          console.log(`${chalk.bold.blue(proc.id)}`);
          console.log(`  ${chalk.dim("Site:")}    ${proc.site}`);
          console.log(`  ${chalk.dim("Port:")}    ${proc.port}`);
          if (proc.pid) {
            console.log(`  ${chalk.dim("PID:")}     ${proc.pid}`);
          }
          console.log(`  ${chalk.dim("Status:")}  ${status}`);
          console.log(`  ${chalk.dim("Uptime:")}  ${formatUptime(proc.uptime)}`);
          
          // Show resource usage if available and requested
          if (options.resources && proc.resources) {
            const cpuColor = proc.resources.cpu > 80 ? chalk.red : proc.resources.cpu > 50 ? chalk.yellow : chalk.green;
            const memColor = proc.resources.memoryMB > 512 ? chalk.red : proc.resources.memoryMB > 256 ? chalk.yellow : chalk.green;
            console.log(`  ${chalk.dim("CPU:")}     ${cpuColor(proc.resources.cpu.toFixed(1) + "%")}`);
            console.log(`  ${chalk.dim("Memory:")}  ${memColor(proc.resources.memoryMB.toFixed(1) + "MB")}`);
          }
          
          // Show restart count if available
          if (proc.restartCount !== undefined && proc.restartCount > 0) {
            const restartColor = proc.restartCount > 5 ? chalk.red : proc.restartCount > 2 ? chalk.yellow : chalk.dim;
            console.log(`  ${chalk.dim("Restarts:")} ${restartColor(proc.restartCount.toString())}`);
          }
          
          if (options.health && proc.healthChecks) {
            const successRate = proc.healthChecks.total > 0 
              ? ((proc.healthChecks.total - proc.healthChecks.failed) / proc.healthChecks.total * 100).toFixed(1)
              : "N/A";
            console.log(`  ${chalk.dim("Health:")}  ${successRate}% (${proc.healthChecks.failed}/${proc.healthChecks.total} failed)`);
            if (proc.healthChecks.consecutiveFailed > 0) {
              console.log(`  ${chalk.dim("Consecutive fails:")} ${chalk.red(proc.healthChecks.consecutiveFailed)}`);
            }
          }
          console.log("");
        });

        console.log(`${chalk.dim("Total:")} ${filteredProcesses.length} process(es)`);
        
        if (options.resources) {
          const totalCpu = filteredProcesses
            .filter(p => p.resources)
            .reduce((sum, p) => sum + (p.resources?.cpu || 0), 0);
          const totalMemory = filteredProcesses
            .filter(p => p.resources)
            .reduce((sum, p) => sum + (p.resources?.memoryMB || 0), 0);
          
          if (totalCpu > 0 || totalMemory > 0) {
            console.log(`${chalk.dim("Total CPU:")} ${totalCpu.toFixed(1)}% | ${chalk.dim("Total Memory:")} ${totalMemory.toFixed(1)}MB`);
          }
        }
        
        console.log(
          `\n${chalk.dim("Commands:")} deploy processes restart <id> | stop <id> | logs <site> <port> | stats <id>`
        );
      } catch (err) {
        console.error(chalk.red("Failed to list processes:"), err);
        process.exit(1);
      }
    });
    
  // Watch processes (real-time updates)
  processesCommand
    .command("watch")
    .description("Watch processes in real-time")
    .option("--interval <seconds>", "Update interval in seconds", "2")
    .option("--resources", "Show CPU and memory usage", false)
    .action(async (options) => {
      const interval = parseInt(options.interval) * 1000;
      
      // Clear screen and hide cursor
      process.stdout.write('\x1B[2J\x1B[0f\x1B[?25l');
      
      const update = async () => {
        try {
          // Move cursor to top
          process.stdout.write('\x1B[H');
          
          const { processManager } = await import(
            "../../server/utils/process-manager"
          );
          
          const processes = processManager.getProcesses();
          const runningProcesses = processes.filter(p => p.status === "running" || p.status === "unhealthy");
          
          console.log(chalk.bold(`🔄 Process Monitor (updating every ${options.interval}s)`));
          console.log(chalk.dim(`${new Date().toLocaleTimeString()} | Press Ctrl+C to exit`));
          console.log("=".repeat(60));
          
          if (runningProcesses.length === 0) {
            console.log(chalk.yellow("No processes are currently running."));
            return;
          }
          
          runningProcesses.forEach((proc) => {
            const statusColor = getStatusColor(proc.status);
            const status = statusColor(proc.status.toUpperCase());
            
            let line = `${chalk.bold.blue(proc.id.padEnd(20))} ${status.padEnd(15)} ${formatUptime(proc.uptime).padEnd(15)}`;
            
            if (options.resources && proc.resources) {
              const cpuColor = proc.resources.cpu > 80 ? chalk.red : proc.resources.cpu > 50 ? chalk.yellow : chalk.green;
              const memColor = proc.resources.memoryMB > 512 ? chalk.red : proc.resources.memoryMB > 256 ? chalk.yellow : chalk.green;
              line += ` ${cpuColor((proc.resources.cpu.toFixed(1) + "%").padEnd(8))} ${memColor((proc.resources.memoryMB.toFixed(1) + "MB").padEnd(10))}`;
            }
            
            console.log(line);
          });
          
          // Clear rest of screen
          process.stdout.write('\x1B[J');
          
        } catch (err) {
          console.error(chalk.red("Error updating processes:"), err);
        }
      };
      
      // Initial update
      await update();
      
      // Set up interval
      const updateInterval = setInterval(update, interval);
      
      // Handle exit
      process.on('SIGINT', () => {
        clearInterval(updateInterval);
        process.stdout.write('\x1B[?25h'); // Show cursor
        console.log('\n');
        process.exit(0);
      });
    });

  // Restart a process
  processesCommand
    .command("restart <id>")
    .description("Restart a specific process")
    .option("--timeout <seconds>", "Timeout for restart operation", "30")
    .option("--verbose", "Show detailed output", false)
    .action(async (id: string, options) => {
      try {
        const { processManager } = await import(
          "../../server/utils/process-manager"
        );

        // Get process info first for better error reporting
        const processes = processManager.getProcesses();
        const processInfo = processes.find(p => p.id === id);
        
        if (!processInfo) {
          console.error(chalk.red(`Process ${id} not found`));
          console.log(chalk.dim("Available processes:"));
          processes.forEach(p => {
            console.log(`  ${p.id} (${p.site}:${p.port}) - ${getStatusColor(p.status)(p.status)}`);
          });
          process.exit(1);
        }

        console.log(`Attempting to restart process: ${chalk.bold(id)}`);
        if (options.verbose) {
          console.log(`  Site: ${processInfo.site}`);
          console.log(`  Port: ${processInfo.port}`);
          console.log(`  Current Status: ${getStatusColor(processInfo.status)(processInfo.status)}`);
          console.log(`  Uptime: ${formatUptime(processInfo.uptime)}`);
        }

        const startTime = Date.now();
        const result = await processManager.restartProcess(id);
        const duration = Date.now() - startTime;

        if (result) {
          console.log(chalk.green(`✅ Process ${id} restarted successfully (${duration}ms)`));
          
          if (options.verbose) {
            // Wait a moment and check the health
            await new Promise(resolve => setTimeout(resolve, 2000));
            const isHealthy = processManager.isProcessHealthy(id);
            console.log(`Health check: ${isHealthy ? chalk.green("✅ Healthy") : chalk.red("❌ Unhealthy")}`);
            
            if (!isHealthy) {
              console.log(chalk.yellow("Process may need additional time to start. Check status with:"));
              console.log(chalk.dim(`  deploy processes list`));
              console.log(chalk.dim(`  deploy processes logs ${processInfo.site} ${processInfo.port}`));
            }
          }
          
          process.exit(0);
        } else {
          console.error(chalk.red(`❌ Failed to restart process ${id} (${duration}ms)`));
          console.log(chalk.yellow("\nTroubleshooting tips:"));
          console.log(`  • Check if port ${processInfo.port} is available: ${chalk.dim(`lsof -i :${processInfo.port}`)}`);
          console.log(`  • View process logs: ${chalk.dim(`deploy processes logs ${processInfo.site} ${processInfo.port}`)}`);
          console.log(`  • Check process status: ${chalk.dim(`deploy processes list`)}`);
          console.log(`  • Try stopping and starting: ${chalk.dim(`deploy processes stop ${id} && deploy processes restart ${id}`)}`);
          process.exit(1);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red("Failed to restart process:"), errorMsg);
        
        console.log(chalk.yellow("\nThis error might be caused by:"));
        console.log("  • Port conflicts or network issues");
        console.log("  • Missing dependencies or configuration");
        console.log("  • Process manager not running");
        console.log("  • Insufficient permissions");
        
        console.log(chalk.dim("\nFor more help:"));
        console.log(chalk.dim("  deploy processes list --all"));
        console.log(chalk.dim("  deploy processes health"));
        
        process.exit(1);
      }
    });

  // Stop a process
  processesCommand
    .command("stop <id>")
    .description("Stop a specific process")
    .action(async (id: string) => {
      try {
        // For stop, we still need the process manager since it handles the actual process
        const { processManager } = await import(
          "../../server/utils/process-manager"
        );

        console.log(`Attempting to stop process: ${id}`);
        const result = await processManager.stopProcess(id);

        if (result) {
          // Update the status in the database directly
          try {
            processModel.updateStatus(id, "stopped");
            console.log(chalk.green(`Process ${id} stopped successfully`));
            process.exit(0);
          } catch (dbErr) {
            console.warn(
              chalk.yellow(
                `Process stopped but failed to update database: ${dbErr}`
              )
            );
            process.exit(0); // Still exit with success since the process was stopped
          }
        } else {
          console.error(chalk.red(`Failed to stop process ${id}`));
          process.exit(1);
        }
      } catch (err) {
        console.error("Failed to stop process:", err);
        process.exit(1);
      }
    });

  // View logs for a process
  processesCommand
    .command("logs <site> <port>")
    .description("View logs for a specific process")
    .option("-f, --follow", "Follow log output (tail -f)", false)
    .option("-n, --lines <lines>", "Number of lines to show", "50")
    .option("-e, --errors", "Show only stderr logs", false)
    .option("-o, --output", "Show only stdout logs", false)
    .action(
      async (
        site: string,
        port: string,
        options: { follow: boolean; lines: string; errors: boolean; output: boolean }
      ) => {
        try {
          const logsDir = resolve(process.cwd(), "logs");
          const stdoutLog = resolve(logsDir, `${site}-${port}.out.log`);
          const stderrLog = resolve(logsDir, `${site}-${port}.err.log`);

          const stdoutExists = existsSync(stdoutLog);
          const stderrExists = existsSync(stderrLog);

          if (!stdoutExists && !stderrExists) {
            console.error(chalk.red(`No logs found for ${site}:${port}`));
            console.log(chalk.dim(`Expected logs at:`));
            console.log(chalk.dim(`  ${stdoutLog}`));
            console.log(chalk.dim(`  ${stderrLog}`));
            process.exit(1);
          }

          const lines = parseInt(options.lines, 10);
          console.log(chalk.bold(`\n📋 Logs for ${site}:${port}\n`));

          // Show stdout if requested or if neither specific log type is requested
          if (stdoutExists && (options.output || (!options.errors && !options.output))) {
            console.log(chalk.cyan.bold("STDOUT:"));
            console.log(chalk.dim("─".repeat(60)));
            
            if (options.follow) {
              const { spawn } = require("child_process");
              const tailProcess = spawn("tail", ["-n", lines.toString(), "-f", stdoutLog], {
                stdio: "inherit"
              });
              
              process.on('SIGINT', () => {
                tailProcess.kill();
                process.exit(0);
              });
              
              await new Promise((resolve) => {
                tailProcess.on("exit", resolve);
              });
            } else {
              try {
                const content = readFileSync(stdoutLog, 'utf8');
                const logLines = content.split('\n').slice(-lines).filter(line => line.trim());
                logLines.forEach(line => console.log(line));
              } catch (err) {
                console.error(chalk.red(`Failed to read stdout log: ${err}`));
              }
            }
          }

          // Show stderr if requested or if neither specific log type is requested
          if (stderrExists && (options.errors || (!options.errors && !options.output)) && !options.follow) {
            console.log(chalk.red.bold("\nSTDERR:"));
            console.log(chalk.dim("─".repeat(60)));
            
            try {
              const content = readFileSync(stderrLog, 'utf8');
              const logLines = content.split('\n').slice(-lines).filter(line => line.trim());
              if (logLines.length > 0) {
                logLines.forEach(line => console.log(chalk.red(line)));
              } else {
                console.log(chalk.dim("No errors logged"));
              }
            } catch (err) {
              console.error(chalk.red(`Failed to read stderr log: ${err}`));
            }
          }

          if (options.follow && !options.output && !options.errors) {
            console.log(chalk.dim("\nPress Ctrl+C to exit"));
          }
        } catch (err) {
          console.error(chalk.red("Failed to view logs:"), err);
          process.exit(1);
        }
      }
    );

  // Process statistics command
  processesCommand
    .command("stats <id>")
    .description("Show detailed statistics for a process")
    .option("--minutes <minutes>", "Show average over last N minutes", "5")
    .action(async (id: string, options) => {
      try {
        const { processManager } = await import(
          "../../server/utils/process-manager"
        );
        
        const processes = processManager.getProcesses();
        const proc = processes.find(p => p.id === id);
        
        if (!proc) {
          console.error(chalk.red(`Process ${id} not found`));
          process.exit(1);
        }
        
        console.log(chalk.bold(`\n📊 Process Statistics: ${proc.id}`));
        console.log("=".repeat(50));
        console.log(`${chalk.dim("Site:")}     ${proc.site}`);
        console.log(`${chalk.dim("Port:")}     ${proc.port}`);
        console.log(`${chalk.dim("PID:")}      ${proc.pid || 'N/A'}`);
        console.log(`${chalk.dim("Status:")}   ${getStatusColor(proc.status)(proc.status)}`);
        console.log(`${chalk.dim("Uptime:")}   ${formatUptime(proc.uptime)}`);
        
        if (proc.restartCount !== undefined) {
          const restartColor = proc.restartCount > 5 ? chalk.red : proc.restartCount > 2 ? chalk.yellow : chalk.green;
          console.log(`${chalk.dim("Restarts:")} ${restartColor(proc.restartCount.toString())}`);
        }
        
        if (proc.resources) {
          console.log("\n" + chalk.bold("Current Resources:"));
          const cpuColor = proc.resources.cpu > 80 ? chalk.red : proc.resources.cpu > 50 ? chalk.yellow : chalk.green;
          const memColor = proc.resources.memoryMB > 512 ? chalk.red : proc.resources.memoryMB > 256 ? chalk.yellow : chalk.green;
          console.log(`${chalk.dim("CPU:")}      ${cpuColor(proc.resources.cpu.toFixed(1) + "%")}`);
          console.log(`${chalk.dim("Memory:")}   ${memColor(proc.resources.memoryMB.toFixed(1) + "MB")} (${(proc.resources.memory / 1024 / 1024 / 1024).toFixed(2)}GB)`);
        }
        
        if (proc.healthChecks && proc.healthChecks.total > 0) {
          console.log("\n" + chalk.bold("Health Checks:"));
          const successRate = ((proc.healthChecks.total - proc.healthChecks.failed) / proc.healthChecks.total * 100).toFixed(1);
          const healthColor = parseFloat(successRate) > 95 ? chalk.green : parseFloat(successRate) > 80 ? chalk.yellow : chalk.red;
          console.log(`${chalk.dim("Success Rate:")} ${healthColor(successRate + "%")} (${proc.healthChecks.failed}/${proc.healthChecks.total} failed)`);
          
          if (proc.healthChecks.consecutiveFailed > 0) {
            console.log(`${chalk.dim("Consecutive Fails:")} ${chalk.red(proc.healthChecks.consecutiveFailed.toString())}`);
          }
          
          if (proc.healthChecks.lastCheck) {
            console.log(`${chalk.dim("Last Check:")} ${proc.healthChecks.lastCheck.toLocaleString()}`);
          }
        }
        
        console.log("");
        
      } catch (err) {
        console.error(chalk.red("Failed to get process statistics:"), err);
        process.exit(1);
      }
    });

  // Kill a process forcefully
  processesCommand
    .command("kill <id>")
    .description("Force kill a specific process")
    .action(async (id: string) => {
      try {
        const { processManager } = await import(
          "../../server/utils/process-manager"
        );
        
        const processes = processManager.getProcesses();
        const processInfo = processes.find(p => p.id === id);
        
        if (!processInfo || !processInfo.pid) {
          console.error(chalk.red(`Process ${id} not found or has no PID`));
          process.exit(1);
        }
        
        console.log(`Force killing process: ${id} (PID: ${processInfo.pid})`);
        
        try {
          process.kill(processInfo.pid, 'SIGKILL');
          console.log(chalk.green(`Process ${id} killed successfully`));
        } catch (err) {
          console.error(chalk.red(`Failed to kill process ${id}: ${err}`));
          process.exit(1);
        }
        
      } catch (err) {
        console.error("Failed to kill process:", err);
        process.exit(1);
      }
    });

  // Add bulk operations
  processesCommand
    .command("restart-all")
    .description("Restart all running processes")
    .option("--site <site>", "Restart only processes for a specific site")
    .option("--verbose", "Show detailed output including error messages", false)
    .option("--sequential", "Restart processes one at a time (default)", true)
    .option("--timeout <seconds>", "Timeout for each restart operation", "30")
    .action(async (options) => {
      try {
        const { processManager } = await import(
          "../../server/utils/process-manager"
        );
        
        if (options.site) {
          console.log(chalk.blue(`Restarting all processes for site: ${options.site}`));
          console.log(chalk.dim("This operation will restart processes sequentially to avoid conflicts"));
          
          const result = await processManager.restartSiteProcesses(options.site);
          
          if (result.success) {
            console.log(chalk.green(`✅ Successfully restarted all processes for ${options.site}`));
            
            if (options.verbose && result.details) {
              console.log(chalk.bold("\nDetailed Results:"));
              Object.entries(result.details).forEach(([id, detail]) => {
                console.log(`  ${chalk.dim(id)}: ${detail}`);
              });
            }
          } else {
            console.log(chalk.red(`❌ Some processes failed to restart for ${options.site}`));
            
            // Show results with details
            console.log(chalk.bold("\nRestart Results:"));
            Object.entries(result.results).forEach(([id, success]) => {
              const status = success ? chalk.green("✅") : chalk.red("❌");
              const detail = result.details?.[id] || "No details available";
              console.log(`  ${status} ${id}`);
              if (options.verbose || !success) {
                console.log(`     ${chalk.dim(detail)}`);
              }
            });
            
            const successCount = Object.values(result.results).filter(Boolean).length;
            const totalCount = Object.keys(result.results).length;
            console.log(`\n${chalk.bold(`Summary: ${successCount}/${totalCount} processes restarted successfully`)}`);
            
            process.exit(1);
          }
        } else {
          const processes = processManager.getProcesses().filter(p => p.status === "running" || p.status === "unhealthy");
          
          if (processes.length === 0) {
            console.log(chalk.yellow("No running processes to restart"));
            
            // Check if there are any stopped processes that might need to be started
            const stoppedProcesses = processManager.getProcesses().filter(p => p.status === "stopped" || p.status === "failed");
            if (stoppedProcesses.length > 0) {
              console.log(chalk.dim(`Found ${stoppedProcesses.length} stopped processes. Use 'deploy processes list --all' to see them.`));
            }
            return;
          }
          
          console.log(chalk.blue(`Restarting ${processes.length} processes sequentially...`));
          console.log(chalk.dim("This may take a moment to avoid port conflicts and ensure stability"));
          
          let successCount = 0;
          const results: { [id: string]: { success: boolean; error?: string } } = {};
          
          for (const proc of processes) {
            try {
              console.log(chalk.dim(`Restarting ${proc.id} (${proc.site}:${proc.port})...`));
              
              const startTime = Date.now();
              const success = await processManager.restartProcess(proc.id);
              const duration = Date.now() - startTime;
              
              results[proc.id] = { success };
              
              if (success) {
                successCount++;
                console.log(chalk.green(`  ✅ ${proc.id} (${duration}ms)`));
              } else {
                console.log(chalk.red(`  ❌ ${proc.id} (${duration}ms)`));
                results[proc.id].error = "Restart failed - check logs for details";
              }
              
              // Brief pause between restarts
              if (processes.indexOf(proc) < processes.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
              }
              
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              results[proc.id] = { success: false, error: errorMsg };
              console.log(chalk.red(`  ❌ ${proc.id} - ${errorMsg}`));
            }
          }
          
          console.log(`\n${chalk.bold(`Restart completed: ${successCount}/${processes.length} successful`)}`);
          
          if (options.verbose) {
            console.log(chalk.bold("\nDetailed Results:"));
            Object.entries(results).forEach(([id, result]) => {
              const status = result.success ? chalk.green("✅") : chalk.red("❌");
              console.log(`  ${status} ${id}`);
              if (result.error) {
                console.log(`     ${chalk.red(result.error)}`);
              }
            });
          }
          
          if (successCount < processes.length) {
            const failedCount = processes.length - successCount;
            console.log(chalk.red(`\n${failedCount} process(es) failed to restart. Use --verbose for more details.`));
            console.log(chalk.dim("Check logs with: deploy processes logs <site> <port>"));
            process.exit(1);
          } else {
            console.log(chalk.green("\n🎉 All processes restarted successfully!"));
          }
        }
      } catch (err) {
        console.error(chalk.red("Failed to restart processes:"), err);
        if (err instanceof Error) {
          console.error(chalk.dim("Error details:"), err.message);
        }
        process.exit(1);
      }
    });

  // Health check command
  processesCommand
    .command("health [id]")
    .description("Check health status of processes")
    .action(async (id?: string) => {
      try {
        const { processManager } = await import(
          "../../server/utils/process-manager"
        );
        
        const processes = processManager.getProcesses();
        const targetProcesses = id ? processes.filter(p => p.id === id) : processes;
        
        if (targetProcesses.length === 0) {
          console.log(chalk.yellow(id ? `Process ${id} not found` : "No processes running"));
          return;
        }
        
        console.log(chalk.bold("\n🩺 Health Check Results"));
        console.log("======================\n");
        
        for (const proc of targetProcesses) {
          const isHealthy = processManager.isProcessHealthy(proc.id);
          const healthIcon = isHealthy ? "🟢" : "🔴";
          const healthText = isHealthy ? chalk.green("HEALTHY") : chalk.red("UNHEALTHY");
          
          console.log(`${healthIcon} ${chalk.bold(proc.id)} - ${healthText}`);
          console.log(`   ${chalk.dim("Site:")} ${proc.site}:${proc.port}`);
          console.log(`   ${chalk.dim("Uptime:")} ${formatUptime(proc.uptime)}`);
          console.log(`   ${chalk.dim("Status:")} ${getStatusColor(proc.status)(proc.status)}`);
          console.log();
        }
      } catch (err) {
        console.error(chalk.red("Failed to check health:"), err);
        process.exit(1);
      }
    });
}

/**
 * Get appropriate color for process status
 */
function getStatusColor(status: string): (text: string) => string {
  switch (status.toLowerCase()) {
    case "running":
      return chalk.green;
    case "stopped":
      return chalk.gray;
    case "failed":
    case "unhealthy":
      return chalk.red;
    case "starting":
    case "restarting":
      return chalk.yellow;
    default:
      return chalk.white;
  }
}

/**
 * Format uptime in seconds to a human-readable string
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours} hour${hours === 1 ? "" : "s"}, ${minutes} minute${
      minutes === 1 ? "" : "s"
    }`;
  } else {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days} day${days === 1 ? "" : "s"}, ${hours} hour${
      hours === 1 ? "" : "s"
    }`;
  }
}