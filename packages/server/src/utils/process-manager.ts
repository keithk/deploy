import { debug, info, warn, error } from "./logging";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { appendFile } from "fs/promises";
import {
  processModel,
  ProcessInfo as DbProcessInfo,
  ProcessRegistryEntry as DbProcessRegistryEntry
} from "@dialup-deploy/core";

// Define Bun.Process type since it's not in the TypeScript definitions
type Signals =
  | "SIGABRT"
  | "SIGALRM"
  | "SIGBUS"
  | "SIGCHLD"
  | "SIGCONT"
  | "SIGFPE"
  | "SIGHUP"
  | "SIGILL"
  | "SIGINT"
  | "SIGIO"
  | "SIGKILL"
  | "SIGPIPE"
  | "SIGPROF"
  | "SIGPWR"
  | "SIGQUIT"
  | "SIGSEGV"
  | "SIGSTKFLT"
  | "SIGSTOP"
  | "SIGSYS"
  | "SIGTERM"
  | "SIGTRAP"
  | "SIGTSTP"
  | "SIGTTIN"
  | "SIGTTOU"
  | "SIGURG"
  | "SIGUSR1"
  | "SIGUSR2"
  | "SIGVTALRM"
  | "SIGWINCH"
  | "SIGXCPU"
  | "SIGXFSZ";

type BunProcess = {
  pid?: number;
  killed?: boolean;
  exited: Promise<number>;
  kill: (exitCode?: number | Signals) => void;
  stdout?: ReadableStream<Uint8Array>;
  stderr?: ReadableStream<Uint8Array>;
};

// Interface for process information
interface ProcessInfo {
  process: BunProcess;
  site: string;
  port: number;
  type: string;
  script: string;
  cwd: string;
  env: Record<string, string>;
  lastRestart?: Date;
  startTime: Date;
  healthChecks: {
    total: number;
    failed: number;
    lastCheck?: Date;
  };
}

// Interface for process registry entry
interface ProcessRegistryEntry {
  id: string;
  site: string;
  port: number;
  pid?: number;
  startTime: number;
  type: string;
  script: string;
  cwd: string;
  status: string;
}

/**
 * Process Manager for managing site processes
 * Handles starting, stopping, and monitoring processes
 */
export class ProcessManager {
  private processes: Map<string, ProcessInfo> = new Map();
  private logsDir: string;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private maxRestarts = 3; // Maximum number of restarts within restart window
  private restartWindow = 60000; // 1 minute window for restart counting
  private restartHistory: Map<string, number[]> = new Map(); // Track restart timestamps

  constructor(options: { logsDir?: string } = {}) {
    // Set up logs directory
    this.logsDir = options.logsDir || join(process.cwd(), "logs");
    if (!existsSync(this.logsDir)) {
      try {
        mkdirSync(this.logsDir, { recursive: true });
      } catch (err) {
        error(`Failed to create logs directory: ${err}`);
      }
    }

    // Start health check interval
    this.startHealthChecks();
  }

  /**
   * Generate a unique ID for a process
   */
  private generateProcessId(site: string, port: number): string {
    return `${site}:${port}`;
  }

  /**
   * Start a process for a site
   */
  async startProcess(
    site: string,
    port: number,
    script: string,
    cwd: string,
    type: string = "site",
    env: Record<string, string> = {}
  ): Promise<boolean> {
    const processId = this.generateProcessId(site, port);

    // Check if process is already running
    if (this.processes.has(processId)) {
      warn(`Process for ${site} on port ${port} is already running`);
      return true;
    }

    // Set up log files
    const stdout = join(this.logsDir, `${site}-${port}.out.log`);
    const stderr = join(this.logsDir, `${site}-${port}.err.log`);

    // Add timestamp to log files
    const timestamp = new Date().toISOString();
    await appendFile(
      stdout,
      `\n\n--- Process started at ${timestamp} ---\n\n`,
      "utf8"
    ).catch((err) => error(`Failed to write to stdout log: ${err}`));
    await appendFile(
      stderr,
      `\n\n--- Process started at ${timestamp} ---\n\n`,
      "utf8"
    ).catch((err) => error(`Failed to write to stderr log: ${err}`));

    // Prepare environment variables
    const processEnv = {
      ...process.env,
      ...env,
      PORT: port.toString()
    };

    // Determine command to run based on script
    let cmd: string[];

    // Get the package manager - either from env or detect it
    const packageManager = env.PACKAGE_MANAGER || detectPackageManager(cwd);

    // Always use the package manager to run the script
    // Do not pass any arguments after the script name - they are already in the package.json
    if (packageManager === "npm") {
      cmd = ["npm", "run", script];
    } else if (packageManager === "yarn") {
      cmd = ["yarn", script];
    } else if (packageManager === "pnpm") {
      cmd = ["pnpm", "run", script];
    } else {
      cmd = ["bun", "run", script];
    }

    info(
      `Starting process for ${site} on port ${port} with command: ${cmd.join(
        " "
      )}`
    );

    try {
      // Create file streams for logs
      const stdoutStream = Bun.file(stdout).writer();
      const stderrStream = Bun.file(stderr).writer();

      // Start the process
      const process = Bun.spawn({
        cmd,
        cwd,
        env: processEnv,
        stdout: "pipe",
        stderr: "pipe"
      });

      // Pipe stdout and stderr to log files
      if (process.stdout) {
        // Use a more compatible approach for piping
        (async () => {
          try {
            const reader = process.stdout!.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              await stdoutStream.write(value);
            }
          } catch (err) {
            error(`Failed to pipe stdout: ${err}`);
          } finally {
            stdoutStream.end();
          }
        })();
      }

      if (process.stderr) {
        // Use a more compatible approach for piping
        (async () => {
          try {
            const reader = process.stderr!.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              await stderrStream.write(value);
            }
          } catch (err) {
            error(`Failed to pipe stderr: ${err}`);
          } finally {
            stderrStream.end();
          }
        })();
      }

      // Store process info
      this.processes.set(processId, {
        process,
        site,
        port,
        type,
        script,
        cwd,
        env,
        startTime: new Date(),
        healthChecks: {
          total: 0,
          failed: 0
        }
      });

      // Save to database
      try {
        processModel.save(processId, {
          site,
          port,
          pid: process.pid,
          type,
          script,
          cwd,
          startTime: new Date(),
          status: "running"
        });
        debug(`Saved process ${processId} to database`);
      } catch (err) {
        error(`Failed to save process to database: ${err}`);
      }

      // Handle process exit
      process.exited.then((code) => {
        info(`Process for ${site} on port ${port} exited with code ${code}`);

        // Remove from processes map if it's the current process
        const currentProcess = this.processes.get(processId);
        if (currentProcess && currentProcess.process === process) {
          this.processes.delete(processId);

          // Update status in database
          try {
            processModel.updateStatus(processId, "stopped");
            debug(`Updated process ${processId} status to stopped`);
          } catch (err) {
            error(`Failed to update process status: ${err}`);
          }

          // Attempt to restart if exit was unexpected
          if (code !== 0) {
            this.attemptRestart(site, port, script, cwd, type, env);
          }
        }
      });

      return true;
    } catch (err) {
      error(`Failed to start process for ${site} on port ${port}: ${err}`);
      return false;
    }
  }

  /**
   * Attempt to restart a process with backoff
   */
  private async attemptRestart(
    site: string,
    port: number,
    script: string,
    cwd: string,
    type: string,
    env: Record<string, string>
  ): Promise<void> {
    const processId = this.generateProcessId(site, port);
    const now = Date.now();

    // Initialize restart history if needed
    if (!this.restartHistory.has(processId)) {
      this.restartHistory.set(processId, []);
    }

    // Get restart history and add current timestamp
    const history = this.restartHistory.get(processId)!;
    history.push(now);

    // Clean up old restart timestamps
    const cutoff = now - this.restartWindow;
    const recentRestarts = history.filter((time) => time >= cutoff);
    this.restartHistory.set(processId, recentRestarts);

    // Check if we've exceeded max restarts
    if (recentRestarts.length > this.maxRestarts) {
      error(`Too many restart attempts for ${site} on port ${port}, giving up`);
      return;
    }

    // Calculate backoff delay (exponential with jitter)
    const baseDelay = 1000; // 1 second
    const factor = Math.min(recentRestarts.length, 6); // Cap at 64 seconds
    const maxDelay = baseDelay * Math.pow(2, factor);
    const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15 randomization
    const delay = Math.floor(maxDelay * jitter);

    warn(
      `Restarting process for ${site} on port ${port} in ${delay}ms (attempt ${recentRestarts.length})`
    );

    // Wait and restart
    setTimeout(async () => {
      await this.startProcess(site, port, script, cwd, type, env);
    }, delay);
  }

  /**
   * Stop a process
   */
  async stopProcess(siteId: string): Promise<boolean> {
    const processInfo = this.processes.get(siteId);
    if (!processInfo) {
      warn(`No process found for ${siteId}`);
      return false;
    }

    try {
      // Send SIGTERM to allow graceful shutdown
      processInfo.process.kill("SIGTERM" as Signals);

      // Wait for process to exit (with timeout)
      const exited = await Promise.race([
        processInfo.process.exited,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
      ]);

      // If process didn't exit, force kill
      if (exited === null) {
        warn(`Process ${siteId} didn't exit gracefully, forcing kill`);
        processInfo.process.kill("SIGKILL" as Signals);
      }

      this.processes.delete(siteId);

      // Update status in database
      try {
        processModel.updateStatus(siteId, "stopped");
        debug(`Updated process ${siteId} status to stopped`);
      } catch (err) {
        error(`Failed to update process status: ${err}`);
      }
      return true;
    } catch (err) {
      error(`Failed to stop process ${siteId}: ${err}`);
      return false;
    }
  }

  /**
   * Restart a process
   */
  async restartProcess(siteId: string): Promise<boolean> {
    const processInfo = this.processes.get(siteId);
    if (!processInfo) {
      warn(`No process found for ${siteId}`);
      return false;
    }

    const { site, port, script, cwd, type, env } = processInfo;

    // Stop the process
    const stopped = await this.stopProcess(siteId);
    if (!stopped) {
      return false;
    }

    // Start the process again
    return this.startProcess(site, port, script, cwd, type, env);
  }

  /**
   * Check if a process is healthy
   */
  isProcessHealthy(siteId: string): boolean {
    const processInfo = this.processes.get(siteId);
    if (!processInfo) {
      return false;
    }

    // Check if process is still running
    return processInfo.process.pid !== undefined && !processInfo.process.killed;
  }

  /**
   * Get all processes
   */
  getProcesses(): Array<{
    id: string;
    site: string;
    port: number;
    status: string;
    uptime: number;
  }> {
    // First, check memory processes
    const memoryProcesses = Array.from(this.processes.entries()).map(
      ([id, info]) => {
        const isHealthy = this.isProcessHealthy(id);
        const uptime = Date.now() - info.startTime.getTime();
        const status = isHealthy ? "running" : "unhealthy";

        // Update status in database
        try {
          processModel.updateStatus(id, status);
          debug(`Updated process ${id} status to ${status}`);
        } catch (err) {
          error(`Failed to update process status: ${err}`);
        }

        return {
          id,
          site: info.site,
          port: info.port,
          status,
          uptime: Math.floor(uptime / 1000) // uptime in seconds
        };
      }
    );

    // If we have memory processes, return them
    if (memoryProcesses.length > 0) {
      return memoryProcesses;
    }

    // Otherwise, check the database
    try {
      const dbProcesses = processModel.getAll();

      return dbProcesses.map((entry: DbProcessRegistryEntry) => {
        // Check if the process is still running
        let status = entry.status;

        // If status is running, verify it's actually running
        if (status === "running" && entry.pid) {
          try {
            // Try to send a signal to the process to check if it's running
            process.kill(entry.pid, 0);
          } catch (e) {
            status = "stopped";
            // Update status in database
            try {
              processModel.updateStatus(entry.id, status);
              debug(`Updated process ${entry.id} status to ${status}`);
            } catch (err) {
              error(`Failed to update process status: ${err}`);
            }
          }
        }

        const uptime = Math.floor((Date.now() - entry.startTime) / 1000);

        return {
          id: entry.id,
          site: entry.site,
          port: entry.port,
          status,
          uptime
        };
      });
    } catch (err) {
      error(`Failed to load processes from database: ${err}`);
      return [];
    }
  }

  /**
   * Get a process by site and port
   */
  getProcess(site: string, port: number): ProcessInfo | undefined {
    const processId = this.generateProcessId(site, port);
    return this.processes.get(processId);
  }

  /**
   * Find processes by site name
   * @param site The site name to find processes for
   * @returns Array of process IDs for the site
   */
  findProcessesBySite(site: string): string[] {
    const processIds: string[] = [];

    for (const [id, info] of this.processes.entries()) {
      if (info.site === site) {
        processIds.push(id);
      }
    }

    return processIds;
  }

  /**
   * Restart a site's processes
   * @param site The site name to restart processes for
   * @returns Object with success status and results for each process
   */
  async restartSiteProcesses(site: string): Promise<{
    success: boolean;
    results: { [processId: string]: boolean };
  }> {
    const processIds = this.findProcessesBySite(site);
    const results: { [processId: string]: boolean } = {};
    let overallSuccess = true;

    info(
      `Restarting all processes for site: ${site} (found ${processIds.length} processes)`
    );

    for (const processId of processIds) {
      try {
        const success = await this.restartProcess(processId);
        results[processId] = success;

        if (!success) {
          overallSuccess = false;
          warn(`Failed to restart process ${processId} for site ${site}`);
        } else {
          info(`Successfully restarted process ${processId} for site ${site}`);
        }
      } catch (err) {
        results[processId] = false;
        overallSuccess = false;
        error(`Error restarting process ${processId} for site ${site}: ${err}`);
      }
    }

    return {
      success: overallSuccess && processIds.length > 0,
      results
    };
  }

  /**
   * Check if a process exists
   */
  hasProcess(site: string, port: number): boolean {
    const processId = this.generateProcessId(site, port);
    return this.processes.has(processId);
  }

  /**
   * Start health checks
   */
  private startHealthChecks(interval: number = 30000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.checkAllProcesses();
    }, interval);
  }

  /**
   * Check health of all processes
   */
  private checkAllProcesses(): void {
    for (const [id, info] of this.processes.entries()) {
      const isHealthy = this.isProcessHealthy(id);

      // Update health check stats
      info.healthChecks.total++;
      info.healthChecks.lastCheck = new Date();

      if (!isHealthy) {
        info.healthChecks.failed++;
        warn(
          `Process ${id} is unhealthy (${info.healthChecks.failed}/${info.healthChecks.total} failed checks)`
        );

        // If more than 3 consecutive failed checks, restart
        if (info.healthChecks.failed >= 3) {
          warn(`Restarting unhealthy process ${id}`);
          this.restartProcess(id).catch((err) => {
            error(`Failed to restart process ${id}: ${err}`);
          });

          // Reset failed count after restart attempt
          info.healthChecks.failed = 0;
        }
      } else {
        // Reset failed count on successful check
        info.healthChecks.failed = 0;
      }
    }
  }

  /**
   * Shutdown all processes
   */
  async shutdownAll(): Promise<void> {
    info(`Shutting down all processes (${this.processes.size} total)`);

    // Stop health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Stop all processes
    const promises = Array.from(this.processes.keys()).map((id) =>
      this.stopProcess(id).catch((err) => {
        error(`Error stopping process ${id}: ${err}`);
        return false;
      })
    );

    await Promise.all(promises);
  }
}

/**
 * Detect package manager from package.json and lock files
 */
function detectPackageManager(dir: string): string {
  if (existsSync(join(dir, "bun.lock"))) {
    return "bun";
  } else if (existsSync(join(dir, "yarn.lock"))) {
    return "yarn";
  } else if (existsSync(join(dir, "pnpm-lock.yaml"))) {
    return "pnpm";
  } else {
    return "npm";
  }
}

// Create a singleton instance
export const processManager = new ProcessManager();
