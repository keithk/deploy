import { debug, info, warn, error } from "./logging";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { appendFile, writeFile } from "fs/promises";
import {
  processModel,
  ProcessInfo as DbProcessInfo,
  ProcessRegistryEntry as DbProcessRegistryEntry
} from "@keithk/deploy-core";

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
  logWriters?: {
    stdout: BunFile;
    stderr: BunFile;
  };
  healthChecks: {
    total: number;
    failed: number;
    lastCheck?: Date;
    consecutiveFailed: number;
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
  private isShuttingDown = false;

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
    const stdoutPath = join(this.logsDir, `${site}-${port}.out.log`);
    const stderrPath = join(this.logsDir, `${site}-${port}.err.log`);

    // Add timestamp to log files
    const timestamp = new Date().toISOString();
    try {
      await appendFile(
        stdoutPath,
        `\n\n--- Process started at ${timestamp} ---\n\n`,
        "utf8"
      );
      await appendFile(
        stderrPath,
        `\n\n--- Process started at ${timestamp} ---\n\n`,
        "utf8"
      );
    } catch (err) {
      error(`Failed to initialize log files: ${err}`);
    }

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
      // Start the process with simplified logging
      const process = Bun.spawn({
        cmd,
        cwd,
        env: processEnv,
        stdout: Bun.file(stdoutPath),
        stderr: Bun.file(stderrPath)
      });

      // Store process info
      const processInfo: ProcessInfo = {
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
          failed: 0,
          consecutiveFailed: 0
        }
      };
      
      this.processes.set(processId, processInfo);

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
          this.cleanupProcess(processId);

          // Update status in database
          this.updateProcessStatus(processId, "stopped");

          // Attempt to restart if exit was unexpected and we're not shutting down
          if (code !== 0 && !this.isShuttingDown) {
            this.attemptRestart(site, port, script, cwd, type, env);
          }
        }
      }).catch((err) => {
        error(`Error handling process exit for ${processId}: ${err}`);
      });

      return true;
    } catch (err) {
      error(`Failed to start process for ${site} on port ${port}: ${err}`);
      return false;
    }
  }

  /**
   * Clean up process resources
   */
  private cleanupProcess(processId: string): void {
    const processInfo = this.processes.get(processId);
    if (processInfo) {
      // Clean up any log writers if they exist
      if (processInfo.logWriters) {
        // Log writers cleanup would go here if we had them
        // For now, Bun handles file cleanup automatically
      }
      
      this.processes.delete(processId);
      debug(`Cleaned up process ${processId}`);
    }
  }

  /**
   * Update process status in database with error handling
   */
  private updateProcessStatus(processId: string, status: string): void {
    try {
      processModel.updateStatus(processId, status);
      debug(`Updated process ${processId} status to ${status}`);
    } catch (err) {
      error(`Failed to update process status for ${processId}: ${err}`);
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
    if (this.isShuttingDown) {
      debug(`Skipping restart for ${site}:${port} - shutting down`);
      return;
    }

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
      this.updateProcessStatus(processId, "failed");
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
      if (!this.isShuttingDown) {
        try {
          await this.startProcess(site, port, script, cwd, type, env);
        } catch (err) {
          error(`Failed to restart process ${processId}: ${err}`);
        }
      }
    }, delay);
  }

  /**
   * Stop a process with graceful shutdown
   */
  async stopProcess(siteId: string, timeout: number = 10000): Promise<boolean> {
    const processInfo = this.processes.get(siteId);
    if (!processInfo) {
      warn(`No process found for ${siteId}`);
      return false;
    }

    try {
      info(`Stopping process ${siteId} gracefully...`);
      
      // Send SIGTERM to allow graceful shutdown
      processInfo.process.kill("SIGTERM" as Signals);

      // Wait for process to exit (with configurable timeout)
      const exited = await Promise.race([
        processInfo.process.exited,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeout))
      ]);

      // If process didn't exit, force kill
      if (exited === null) {
        warn(`Process ${siteId} didn't exit gracefully within ${timeout}ms, forcing kill`);
        processInfo.process.kill("SIGKILL" as Signals);
        
        // Wait a bit more for force kill
        await Promise.race([
          processInfo.process.exited,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))
        ]);
      }

      this.cleanupProcess(siteId);
      this.updateProcessStatus(siteId, "stopped");
      
      info(`Process ${siteId} stopped successfully`);
      return true;
    } catch (err) {
      error(`Failed to stop process ${siteId}: ${err}`);
      this.cleanupProcess(siteId);
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
    const isRunning = processInfo.process.pid !== undefined && !processInfo.process.killed;
    
    // Additional health check: verify PID is still valid
    if (isRunning && processInfo.process.pid) {
      try {
        // Send signal 0 to check if process exists
        process.kill(processInfo.process.pid, 0);
        return true;
      } catch (err) {
        debug(`Process ${siteId} PID ${processInfo.process.pid} no longer exists`);
        return false;
      }
    }
    
    return isRunning;
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
    if (this.isShuttingDown) {
      return;
    }

    for (const [id, info] of this.processes.entries()) {
      try {
        const isHealthy = this.isProcessHealthy(id);

        // Update health check stats
        info.healthChecks.total++;
        info.healthChecks.lastCheck = new Date();

        if (!isHealthy) {
          info.healthChecks.failed++;
          info.healthChecks.consecutiveFailed++;
          
          warn(
            `Process ${id} is unhealthy (${info.healthChecks.consecutiveFailed} consecutive failures, ${info.healthChecks.failed}/${info.healthChecks.total} total)`
          );

          // If more than 3 consecutive failed checks, restart
          if (info.healthChecks.consecutiveFailed >= 3) {
            warn(`Restarting unhealthy process ${id} after ${info.healthChecks.consecutiveFailed} consecutive failures`);
            
            this.restartProcess(id).catch((err) => {
              error(`Failed to restart process ${id}: ${err}`);
            });

            // Reset consecutive failed count after restart attempt
            info.healthChecks.consecutiveFailed = 0;
          }
        } else {
          // Reset consecutive failed count on successful check
          info.healthChecks.consecutiveFailed = 0;
        }
      } catch (err) {
        error(`Error during health check for process ${id}: ${err}`);
      }
    }
  }

  /**
   * Shutdown all processes gracefully
   */
  async shutdownAll(timeout: number = 15000): Promise<void> {
    info(`Shutting down all processes (${this.processes.size} total)`);
    this.isShuttingDown = true;

    // Stop health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.processes.size === 0) {
      info("No processes to shutdown");
      return;
    }

    // Stop all processes with timeout
    const startTime = Date.now();
    const promises = Array.from(this.processes.keys()).map(async (id) => {
      try {
        const remainingTimeout = Math.max(1000, timeout - (Date.now() - startTime));
        return await this.stopProcess(id, remainingTimeout);
      } catch (err) {
        error(`Error stopping process ${id}: ${err}`);
        return false;
      }
    });

    const results = await Promise.allSettled(promises);
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value));
    
    if (failed.length > 0) {
      warn(`Failed to gracefully shutdown ${failed.length} processes`);
    }
    
    info(`Process shutdown completed in ${Date.now() - startTime}ms`);
  }
}

/**
 * Detect package manager from package.json and lock files
 */
function detectPackageManager(dir: string): string {
  try {
    if (existsSync(join(dir, "bun.lock"))) {
      return "bun";
    } else if (existsSync(join(dir, "yarn.lock"))) {
      return "yarn";
    } else if (existsSync(join(dir, "pnpm-lock.yaml"))) {
      return "pnpm";
    } else {
      return "npm";
    }
  } catch (err) {
    debug(`Error detecting package manager in ${dir}: ${err}`);
    return "npm"; // Default fallback
  }
}

// Create a singleton instance
export const processManager = new ProcessManager();

// Handle graceful shutdown on process signals
process.on('SIGTERM', async () => {
  info('Received SIGTERM, shutting down process manager...');
  await processManager.shutdownAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  info('Received SIGINT, shutting down process manager...');
  await processManager.shutdownAll();
  process.exit(0);
});
