import { Command } from "commander";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import chalk from "chalk";
import { processModel, info, error as logError } from "@keithk/deploy-core";

interface ProcessInfo {
  id: string;
  site: string;
  port: number;
  status: string;
  uptime: number;
  pid?: number;
  healthChecks?: {
    total: number;
    failed: number;
    consecutiveFailed: number;
    lastCheck?: Date;
  };
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
    .action(async (options) => {
      try {
        const { processManager } = await import(
          "@keithk/deploy-server/src/utils/process-manager"
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
        console.log(
          `\n${chalk.dim("Commands:")} deploy processes restart <id> | stop <id> | logs <site> <port>`
        );
      } catch (err) {
        console.error(chalk.red("Failed to list processes:"), err);
        process.exit(1);
      }
    });

  // Restart a process
  processesCommand
    .command("restart <id>")
    .description("Restart a specific process")
    .action(async (id: string) => {
      try {
        // For restart, we still need the process manager since it handles the actual process
        const { processManager } = await import(
          "@keithk/deploy-server/src/utils/process-manager"
        );

        console.log(`Attempting to restart process: ${id}`);
        const result = await processManager.restartProcess(id);

        if (result) {
          console.log(chalk.green(`Process ${id} restarted successfully`));
          process.exit(0);
        } else {
          console.error(chalk.red(`Failed to restart process ${id}`));
          process.exit(1);
        }
      } catch (err) {
        console.error("Failed to restart process:", err);
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
          "@keithk/deploy-server/src/utils/process-manager"
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

  // Add bulk operations
  processesCommand
    .command("restart-all")
    .description("Restart all running processes")
    .option("--site <site>", "Restart only processes for a specific site")
    .action(async (options) => {
      try {
        const { processManager } = await import(
          "@keithk/deploy-server/src/utils/process-manager"
        );
        
        if (options.site) {
          console.log(chalk.blue(`Restarting all processes for site: ${options.site}`));
          const result = await processManager.restartSiteProcesses(options.site);
          
          if (result.success) {
            console.log(chalk.green(`✅ Successfully restarted all processes for ${options.site}`));
          } else {
            console.log(chalk.red(`❌ Some processes failed to restart for ${options.site}`));
            Object.entries(result.results).forEach(([id, success]) => {
              const status = success ? chalk.green("✅") : chalk.red("❌");
              console.log(`  ${status} ${id}`);
            });
            process.exit(1);
          }
        } else {
          const processes = processManager.getProcesses().filter(p => p.status === "running");
          
          if (processes.length === 0) {
            console.log(chalk.yellow("No running processes to restart"));
            return;
          }
          
          console.log(chalk.blue(`Restarting ${processes.length} processes...`));
          
          let successCount = 0;
          for (const proc of processes) {
            try {
              console.log(chalk.dim(`Restarting ${proc.id}...`));
              const success = await processManager.restartProcess(proc.id);
              if (success) {
                successCount++;
                console.log(chalk.green(`  ✅ ${proc.id}`));
              } else {
                console.log(chalk.red(`  ❌ ${proc.id}`));
              }
            } catch (err) {
              console.log(chalk.red(`  ❌ ${proc.id} - ${err}`));
            }
          }
          
          console.log(`\n${chalk.bold(`Restart completed: ${successCount}/${processes.length} successful`)}`);
          if (successCount < processes.length) {
            process.exit(1);
          }
        }
      } catch (err) {
        console.error(chalk.red("Failed to restart processes:"), err);
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
          "@keithk/deploy-server/src/utils/process-manager"
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