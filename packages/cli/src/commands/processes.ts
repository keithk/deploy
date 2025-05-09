
import { Command } from "commander";
import { resolve } from "path";
import { existsSync } from "fs";
import chalk from "chalk";
import { processModel } from "@dialup-deploy/core";

/**
 * Register the processes command
 */
export function registerProcessesCommand(program: Command): void {
  const processesCommand = program
    .command("processes")
    .description("Manage running processes for passthrough sites");

  // List processes
  processesCommand
    .command("list")
    .description("List all running processes")
    .option("--all", "Show all processes, including stopped ones", false)
    .action(async (options) => {
      try {
        // Get processes from the database
        const dbProcesses = processModel.getAll();

        // Convert to the format expected by the CLI
        const processes = dbProcesses.map((proc) => ({
          id: proc.id,
          site: proc.site,
          port: proc.port,
          status: proc.status,
          uptime: Math.floor((Date.now() - proc.startTime) / 1000)
        }));

        // Filter processes if --all is not specified
        const filteredProcesses = options.all
          ? processes
          : processes.filter(
              (p) => p.status === "running" || p.status === "unhealthy"
            );

        if (filteredProcesses.length === 0) {
          console.log("No processes are currently running.");
          process.exit(0);
        }

        console.log("\nRunning processes:");
        console.log("=================\n");

        filteredProcesses.forEach((proc) => {
          const status =
            proc.status === "running"
              ? chalk.green(proc.status)
              : chalk.red(proc.status);

          console.log(`${chalk.bold(proc.id)}`);
          console.log(`  Site: ${proc.site}`);
          console.log(`  Port: ${proc.port}`);
          console.log(`  Status: ${status}`);
          console.log(`  Uptime: ${formatUptime(proc.uptime)}`);
          console.log("");
        });

        console.log(`Total: ${filteredProcesses.length} process(es)`);
        console.log(
          "\nUse 'bun run processes restart <id>' to restart a process"
        );
        console.log("Use 'bun run processes stop <id>' to stop a process");
        process.exit(0);
      } catch (err) {
        console.error("Failed to list processes:", err);
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
          "@dialup-deploy/server/src/utils/process-manager"
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
          "@dialup-deploy/server/src/utils/process-manager"
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
    .option("-f, --follow", "Follow log output", false)
    .option("-n, --lines <lines>", "Number of lines to show", "50")
    .action(
      async (
        site: string,
        port: string,
        options: { follow: boolean; lines: string }
      ) => {
        try {
          const logsDir = resolve(process.cwd(), "logs");
          const stdoutLog = resolve(logsDir, `${site}-${port}.out.log`);
          const stderrLog = resolve(logsDir, `${site}-${port}.err.log`);

          if (!existsSync(stdoutLog) && !existsSync(stderrLog)) {
            console.error(chalk.red(`No logs found for ${site}:${port}`));
            process.exit(1);
          }

          const { spawn } = require("child_process");
          const lines = parseInt(options.lines, 10);

          console.log(chalk.bold(`\nLogs for ${site}:${port}:`));

          if (existsSync(stdoutLog)) {
            console.log(chalk.cyan("\nSTDOUT:"));
            const tailCmd = options.follow
              ? ["tail", "-n", lines.toString(), "-f", stdoutLog]
              : ["tail", "-n", lines.toString(), stdoutLog];
            const tailProcess = spawn(tailCmd[0], tailCmd.slice(1), {
              stdio: "inherit"
            });

            if (!options.follow) {
              await new Promise((resolve) => {
                tailProcess.on("exit", resolve);
              });
            }
          }

          if (existsSync(stderrLog) && !options.follow) {
            console.log(chalk.red("\nSTDERR:"));
            const tailProcess = spawn(
              "tail",
              ["-n", lines.toString(), stderrLog],
              { stdio: "inherit" }
            );

            await new Promise((resolve) => {
              tailProcess.on("exit", resolve);
            });
          }

          if (options.follow) {
            console.log("\nPress Ctrl+C to exit");
            // Keep the process running for follow mode
            await new Promise(() => {});
          } else {
            // Exit with success for non-follow mode
            process.exit(0);
          }
        } catch (err) {
          console.error("Failed to view logs:", err);
          process.exit(1);
        }
      }
    );
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
