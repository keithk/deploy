import { debug, info, warn, error } from "./logging";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { appendFile, writeFile } from "fs/promises";
import {
  processModel,
  ProcessInfo as DbProcessInfo,
  ProcessRegistryEntry as DbProcessRegistryEntry,
  isPortInUse as coreIsPortInUse
} from "@keithk/deploy-core";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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

type BunFile = {
  size: number;
  type: string;
};

// Interface for process resource usage
interface ProcessResources {
  cpu: number; // CPU usage percentage
  memory: number; // Memory usage in bytes
  timestamp: Date;
}

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
  resources: {
    current: ProcessResources | null;
    history: ProcessResources[];
    maxHistory: number;
  };
  limits: {
    maxMemory?: number; // Max memory in bytes
    maxCpu?: number; // Max CPU percentage
    restartOnLimit: boolean;
  };
  restartPolicy: {
    maxRestarts: number;
    restartWindow: number; // milliseconds
    backoffMultiplier: number;
    enabled: boolean;
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
  private resourceMonitorInterval: NodeJS.Timeout | null = null;
  private maxRestarts = 3; // Maximum number of restarts within restart window
  private restartWindow = 60000; // 1 minute window for restart counting
  private restartHistory: Map<string, number[]> = new Map(); // Track restart timestamps
  private isShuttingDown = false;
  private resourceCheckInterval = 5000; // 5 seconds
  private maxResourceHistory = 60; // Keep 5 minutes of data (60 * 5s)

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

    // Recover processes from database on startup
    this.recoverProcessesFromDatabase();

    // Start health check and resource monitoring intervals
    this.startHealthChecks();
    this.startResourceMonitoring();
  }

  /**
   * Recover processes from database on startup
   */
  private async recoverProcessesFromDatabase(): Promise<void> {
    try {
      const dbProcesses = processModel.getAll();
      info(`Recovering ${dbProcesses.length} processes from database`);

      for (const dbProcess of dbProcesses) {
        const processId = dbProcess.id;
        
        // Check if process is still running
        if (dbProcess.pid && await this.isSystemProcessRunning(dbProcess.pid)) {
          info(`Recovered running process ${processId} (PID: ${dbProcess.pid})`);
          // Update status to running if it was marked differently
          if (dbProcess.status !== 'running') {
            processModel.updateStatus(processId, 'running');
          }
        } else {
          // Process no longer exists, clean up database record
          debug(`Cleaning up stale process record: ${processId}`);
          processModel.delete(processId);
        }
      }
    } catch (err) {
      error(`Error recovering processes from database: ${err}`);
    }
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
    // Generate initial processId for checking existing processes
    let processId = this.generateProcessId(site, port);

    // Check if process is already running in memory
    if (this.processes.has(processId)) {
      const existingProcess = this.processes.get(processId)!;
      if (this.isProcessHealthy(processId)) {
        warn(`Process for ${site} on port ${port} is already running in memory`);
        return true;
      } else {
        // Clean up unhealthy process
        debug(`Cleaning up unhealthy process for ${site} on port ${port}`);
        this.cleanupProcess(processId);
      }
    }

    // Check database for existing process records
    try {
      const dbProcess = processModel.getById(processId);
      if (dbProcess) {
        // Verify if the process is actually running
        if (dbProcess.pid && await this.isSystemProcessRunning(dbProcess.pid)) {
          // Check if it's using the expected port
          if (await coreIsPortInUse(port)) {
            warn(`Process for ${site} on port ${port} is already running (PID: ${dbProcess.pid})`);
            return true;
          }
        }
        // Clean up stale database record
        debug(`Cleaning up stale database record for ${processId}`);
        processModel.delete(processId);
      }
    } catch (err) {
      debug(`Error checking database for existing process: ${err}`);
    }

    // Check if port is already in use and find alternative if in dev mode
    let actualPort = port;
    if (await coreIsPortInUse(port)) {
      // In dev mode with static-build sites, try to find an alternative port
      if (type === "static-build" && env.MODE === "dev") {
        info(`Port ${port} is in use, searching for available port...`);
        const availablePort = await this.findAvailablePort(port, 20);
        if (availablePort) {
          actualPort = availablePort;
          warn(`Using alternative port ${actualPort} for ${site} (original port ${port} was in use)`);
        } else {
          error(`Could not find an available port for ${site}, all ports ${port}-${port + 19} are in use`);
          return false;
        }
      } else {
        error(`Port ${port} is already in use, cannot start process for ${site}`);
        return false;
      }
    }

    // Update processId with actual port
    processId = this.generateProcessId(site, actualPort);

    // Set up log files
    const stdoutPath = join(this.logsDir, `${site}-${actualPort}.out.log`);
    const stderrPath = join(this.logsDir, `${site}-${actualPort}.err.log`);

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
      PORT: actualPort.toString()
    };

    // Determine command to run based on script
    let cmd: string[];

    // Get the package manager - either from env or detect it
    const packageManager = env.PACKAGE_MANAGER || detectPackageManager(cwd);

    // Check if this is a dev script that needs port configuration
    const isDevScript = script === "dev" || script.includes("dev:");
    const needsPortArg = isDevScript && type === "static-build";

    // Build the base command
    if (packageManager === "npm") {
      cmd = ["npm", "run", script];
    } else if (packageManager === "yarn") {
      cmd = ["yarn", script];
    } else if (packageManager === "pnpm") {
      cmd = ["pnpm", "run", script];
    } else {
      cmd = ["bun", "run", script];
    }

    // For dev scripts, append port arguments after -- separator
    if (needsPortArg) {
      // Detect the framework and add appropriate port flag
      const packageJsonPath = join(cwd, "package.json");
      let portFlag = "--port"; // Default flag
      
      try {
        if (existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(await Bun.file(packageJsonPath).text());
          const devCommand = packageJson.scripts?.[script] || "";
          
          // Detect framework based on dev command
          if (devCommand.includes("waku")) {
            portFlag = "--port";
          } else if (devCommand.includes("vite") || devCommand.includes("nuxt")) {
            portFlag = "--port";
          } else if (devCommand.includes("next")) {
            portFlag = "-p";
          } else if (devCommand.includes("remix")) {
            portFlag = "--port";
          } else if (devCommand.includes("astro")) {
            portFlag = "--port";
          } else if (devCommand.includes("eleventy") || devCommand.includes("11ty")) {
            portFlag = "--port";
          } else if (devCommand.includes("webpack-dev-server")) {
            portFlag = "--port";
          }
          
          debug(`Detected framework from command '${devCommand}', using port flag: ${portFlag}`);
        }
      } catch (err) {
        debug(`Could not detect framework: ${err}`);
      }
      
      // Add separator and port argument
      cmd.push("--", portFlag, actualPort.toString());
      
      info(`Dev mode: passing port ${actualPort} to ${script} script with flag ${portFlag}`);
    }

    info(
      `Starting process for ${site} on port ${actualPort} with command: ${cmd.join(
        " "
      )}`
    );
    debug(`Working directory: ${cwd}`);
    debug(`Environment variables: ${JSON.stringify(processEnv, null, 2)}`);

    try {
      // Start the process with simplified logging
      const process = Bun.spawn({
        cmd,
        cwd,
        env: processEnv,
        stdout: Bun.file(stdoutPath),
        stderr: Bun.file(stderrPath)
      }) as any as BunProcess;

      // Store process info
      const processInfo: ProcessInfo = {
        process,
        site,
        port: actualPort,
        type,
        script,
        cwd,
        env,
        startTime: new Date(),
        healthChecks: {
          total: 0,
          failed: 0,
          consecutiveFailed: 0
        },
        resources: {
          current: null,
          history: [],
          maxHistory: this.maxResourceHistory
        },
        limits: {
          maxMemory: env.MAX_MEMORY ? parseInt(env.MAX_MEMORY) : undefined,
          maxCpu: env.MAX_CPU ? parseFloat(env.MAX_CPU) : undefined,
          restartOnLimit: env.RESTART_ON_LIMIT !== "false"
        },
        restartPolicy: {
          maxRestarts: env.MAX_RESTARTS ? parseInt(env.MAX_RESTARTS) : this.maxRestarts,
          restartWindow: env.RESTART_WINDOW ? parseInt(env.RESTART_WINDOW) : this.restartWindow,
          backoffMultiplier: env.BACKOFF_MULTIPLIER ? parseFloat(env.BACKOFF_MULTIPLIER) : 2,
          enabled: env.DISABLE_RESTART !== "true"
        }
      };
      
      this.processes.set(processId, processInfo);

      // Save to database
      try {
        processModel.save(processId, {
          site,
          port: actualPort,
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
        info(`Process for ${site} on port ${actualPort} exited with code ${code}`);

        // Remove from processes map if it's the current process
        const currentProcess = this.processes.get(processId);
        if (currentProcess && currentProcess.process.pid === process.pid) {
          this.cleanupProcess(processId);

          // Update status in database
          this.updateProcessStatus(processId, "stopped");

          // Attempt to restart if exit was unexpected and we're not shutting down
          if (code !== 0 && !this.isShuttingDown) {
            this.attemptRestart(site, actualPort, script, cwd, type, env);
          }
        }
      }).catch((err) => {
        error(`Error handling process exit for ${processId}: ${err}`);
      });

      return true;
    } catch (err) {
      error(`Failed to start process for ${site} on port ${actualPort}: ${err}`);
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
   * Attempt to restart a process with backoff and enhanced coordination
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
    const processInfo = this.processes.get(processId);
    
    // Check if restart policy is enabled
    if (processInfo && !processInfo.restartPolicy.enabled) {
      info(`Restart disabled for process ${processId}`);
      this.updateProcessStatus(processId, "failed");
      return;
    }
    
    const restartPolicy = processInfo?.restartPolicy || {
      maxRestarts: this.maxRestarts,
      restartWindow: this.restartWindow,
      backoffMultiplier: 2,
      enabled: true
    };
    
    const now = Date.now();

    // Initialize restart history if needed
    if (!this.restartHistory.has(processId)) {
      this.restartHistory.set(processId, []);
    }

    // Get restart history and add current timestamp
    const history = this.restartHistory.get(processId)!;
    history.push(now);

    // Clean up old restart timestamps
    const cutoff = now - restartPolicy.restartWindow;
    const recentRestarts = history.filter((time) => time >= cutoff);
    this.restartHistory.set(processId, recentRestarts);

    // Check if we've exceeded max restarts
    if (recentRestarts.length > restartPolicy.maxRestarts) {
      error(`Too many restart attempts for ${site} on port ${port} (${recentRestarts.length}/${restartPolicy.maxRestarts}), giving up`);
      this.updateProcessStatus(processId, "failed");
      return;
    }

    // Calculate backoff delay (exponential with jitter)
    const baseDelay = 1000; // 1 second
    const factor = Math.min(recentRestarts.length, 6); // Cap at 64 seconds
    const maxDelay = baseDelay * Math.pow(restartPolicy.backoffMultiplier, factor);
    const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15 randomization
    const delay = Math.floor(maxDelay * jitter);

    warn(
      `Restarting process for ${site} on port ${port} in ${delay}ms (attempt ${recentRestarts.length}/${restartPolicy.maxRestarts})`
    );

    // Update status to indicate we're about to restart
    this.updateProcessStatus(processId, "restarting");

    // Wait and restart with enhanced validation
    setTimeout(async () => {
      if (this.isShuttingDown) {
        debug(`Cancelling restart for ${processId} - shutting down`);
        return;
      }

      try {
        // Ensure port is free before attempting restart
        if (await coreIsPortInUse(port)) {
          warn(`Port ${port} is still in use, waiting before restart attempt...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          if (await coreIsPortInUse(port)) {
            error(`Port ${port} is still in use, aborting restart attempt for ${processId}`);
            this.updateProcessStatus(processId, "failed");
            return;
          }
        }

        info(`Attempting restart for ${processId} (attempt ${recentRestarts.length}/${restartPolicy.maxRestarts})`);
        const success = await this.startProcess(site, port, script, cwd, type, env);
        
        if (success) {
          info(`Successfully restarted process ${processId} after ${recentRestarts.length} attempts`);
          
          // Verify process health after a brief delay
          setTimeout(() => {
            if (this.isProcessHealthy(processId)) {
              info(`Process ${processId} health verified after auto-restart`);
            } else {
              warn(`Process ${processId} appears unhealthy after auto-restart`);
            }
          }, 3000);
          
        } else {
          error(`Failed to restart process ${processId} (attempt ${recentRestarts.length}/${restartPolicy.maxRestarts})`);
          this.updateProcessStatus(processId, "failed");
        }
      } catch (err) {
        error(`Exception during restart attempt for ${processId}: ${err}`);
        this.updateProcessStatus(processId, "failed");
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
   * Restart a process with enhanced validation and coordination
   */
  async restartProcess(siteId: string): Promise<boolean> {
    const processInfo = this.processes.get(siteId);
    if (!processInfo) {
      // Check database for process info if not in memory
      try {
        const dbProcess = processModel.getById(siteId);
        if (dbProcess) {
          info(`Process ${siteId} not in memory, attempting restart from database record`);
          const success = await this.startProcess(
            dbProcess.site,
            dbProcess.port,
            dbProcess.script,
            dbProcess.cwd,
            dbProcess.type,
            {} // Environment variables not stored in database
          );
          
          if (success) {
            info(`Successfully restarted process ${siteId} from database record`);
          } else {
            error(`Failed to restart process ${siteId} from database record`);
          }
          
          return success;
        }
      } catch (err) {
        debug(`Error checking database for process ${siteId}: ${err}`);
      }
      
      warn(`No process found for ${siteId} in memory or database`);
      return false;
    }

    const { site, port, script, cwd, type, env } = processInfo;
    const processId = this.generateProcessId(site, port);

    info(`Restarting process ${siteId} (${site}:${port})`);

    // Mark as restarting to prevent duplicate restart attempts
    try {
      processModel.updateStatus(processId, "restarting");
    } catch (err) {
      debug(`Could not update status to restarting: ${err}`);
    }

    // Stop the process gracefully
    info(`Stopping process ${siteId}...`);
    const stopped = await this.stopProcess(siteId, 10000); // 10 second timeout
    if (!stopped) {
      error(`Failed to stop process ${siteId}, restart aborted`);
      // Reset status back to what it was
      try {
        processModel.updateStatus(processId, "failed");
      } catch (err) {
        debug(`Could not update status back to failed: ${err}`);
      }
      return false;
    }

    // Wait a moment to ensure port is freed
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify port is actually free before attempting restart
    if (await coreIsPortInUse(port)) {
      error(`Port ${port} is still in use after stopping process ${siteId}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (await coreIsPortInUse(port)) {
        error(`Port ${port} is still in use, restart failed for ${siteId}`);
        try {
          processModel.updateStatus(processId, "failed");
        } catch (err) {
          debug(`Could not update status to failed: ${err}`);
        }
        return false;
      }
    }

    // Start the process again
    info(`Starting process ${siteId}...`);
    const success = await this.startProcess(site, port, script, cwd, type, env);
    
    if (success) {
      info(`Successfully restarted process ${siteId}`);
      
      // Update last restart time
      if (this.processes.has(processId)) {
        const updatedProcessInfo = this.processes.get(processId)!;
        updatedProcessInfo.lastRestart = new Date();
      }
      
      // Verify the process is actually healthy after a brief moment
      setTimeout(async () => {
        if (this.isProcessHealthy(processId)) {
          info(`Process ${siteId} health verified after restart`);
        } else {
          warn(`Process ${siteId} appears unhealthy after restart`);
        }
      }, 2000);
      
    } else {
      error(`Failed to restart process ${siteId}`);
      try {
        processModel.updateStatus(processId, "failed");
      } catch (err) {
        debug(`Could not update status to failed: ${err}`);
      }
    }
    
    return success;
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
   * Check if a system process is running by PID
   */
  private async isSystemProcessRunning(pid: number): Promise<boolean> {
    try {
      // Use ps command to check if process exists
      const { stdout } = await execAsync(`ps -p ${pid} -o pid=`);
      return stdout.trim() !== '';
    } catch (err) {
      return false;
    }
  }

  /**
   * Find an available port starting from the given port
   */
  async findAvailablePort(startPort: number, maxAttempts: number = 10): Promise<number | null> {
    for (let i = 0; i < maxAttempts; i++) {
      const port = startPort + i;
      if (!(await coreIsPortInUse(port))) {
        debug(`Found available port: ${port}`);
        return port;
      }
      debug(`Port ${port} is in use, trying next...`);
    }
    error(`Could not find an available port after ${maxAttempts} attempts starting from ${startPort}`);
    return null;
  }

  /**
   * Get resource usage for a process using native system calls
   */
  private async getProcessResources(pid: number): Promise<ProcessResources | null> {
    try {
      // Use ps command for cross-platform compatibility
      const { stdout } = await execAsync(`ps -p ${pid} -o pid=,pcpu=,rss=`);
      const lines = stdout.trim().split('\n');
      
      if (lines.length === 0) {
        return null;
      }
      
      const parts = lines[0].trim().split(/\s+/);
      if (parts.length >= 3) {
        const cpu = parseFloat(parts[1]) || 0;
        const memoryKB = parseInt(parts[2]) || 0;
        const memory = memoryKB * 1024; // Convert KB to bytes
        
        return {
          cpu,
          memory,
          timestamp: new Date()
        };
      }
      
      return null;
    } catch (err) {
      debug(`Failed to get resource usage for PID ${pid}: ${err}`);
      return null;
    }
  }

  /**
   * Start resource monitoring for all processes
   */
  private startResourceMonitoring(): void {
    if (this.resourceMonitorInterval) {
      clearInterval(this.resourceMonitorInterval);
    }

    this.resourceMonitorInterval = setInterval(async () => {
      await this.monitorAllResources();
    }, this.resourceCheckInterval);
  }

  /**
   * Monitor resources for all processes
   */
  private async monitorAllResources(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    for (const [id, info] of this.processes.entries()) {
      if (!info.process.pid) {
        continue;
      }

      try {
        const resources = await this.getProcessResources(info.process.pid);
        
        if (resources) {
          // Update current resources
          info.resources.current = resources;
          
          // Add to history
          info.resources.history.push(resources);
          
          // Trim history to max length
          if (info.resources.history.length > info.resources.maxHistory) {
            info.resources.history = info.resources.history.slice(-info.resources.maxHistory);
          }
          
          // Check resource limits
          await this.checkResourceLimits(id, info, resources);
        }
      } catch (err) {
        debug(`Error monitoring resources for process ${id}: ${err}`);
      }
    }
  }

  /**
   * Check if process exceeds resource limits
   */
  private async checkResourceLimits(
    processId: string,
    info: ProcessInfo,
    resources: ProcessResources
  ): Promise<void> {
    const { limits } = info;
    
    let shouldRestart = false;
    const violations: string[] = [];
    
    // Check memory limit
    if (limits.maxMemory && resources.memory > limits.maxMemory) {
      violations.push(`Memory: ${Math.round(resources.memory / 1024 / 1024)}MB > ${Math.round(limits.maxMemory / 1024 / 1024)}MB`);
      shouldRestart = true;
    }
    
    // Check CPU limit (average over last 3 measurements to avoid spikes)
    if (limits.maxCpu && info.resources.history.length >= 3) {
      const recentCpu = info.resources.history.slice(-3);
      const avgCpu = recentCpu.reduce((sum, r) => sum + r.cpu, 0) / recentCpu.length;
      
      if (avgCpu > limits.maxCpu) {
        violations.push(`CPU: ${avgCpu.toFixed(1)}% > ${limits.maxCpu}%`);
        shouldRestart = true;
      }
    }
    
    if (shouldRestart && limits.restartOnLimit && info.restartPolicy.enabled) {
      warn(`Process ${processId} exceeded limits: ${violations.join(', ')}. Restarting...`);
      
      try {
        await this.restartProcess(processId);
      } catch (err) {
        error(`Failed to restart process ${processId} due to resource limit violation: ${err}`);
      }
    } else if (violations.length > 0) {
      warn(`Process ${processId} exceeded limits: ${violations.join(', ')} (restart disabled)`);
    }
  }

  /**
   * Get average resource usage over time period
   */
  getAverageResources(processId: string, minutes: number = 5): { cpu: number; memory: number } | null {
    const processInfo = this.processes.get(processId);
    if (!processInfo) {
      return null;
    }
    
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const relevantHistory = processInfo.resources.history.filter(
      r => r.timestamp >= cutoff
    );
    
    if (relevantHistory.length === 0) {
      return processInfo.resources.current ? {
        cpu: processInfo.resources.current.cpu,
        memory: processInfo.resources.current.memory
      } : null;
    }
    
    const avgCpu = relevantHistory.reduce((sum, r) => sum + r.cpu, 0) / relevantHistory.length;
    const avgMemory = relevantHistory.reduce((sum, r) => sum + r.memory, 0) / relevantHistory.length;
    
    return { cpu: avgCpu, memory: avgMemory };
  }

  /**
   * Get all processes with enhanced resource information
   */
  getProcesses(): Array<{
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

        // Get restart count from history
        const restartCount = this.restartHistory.get(id)?.length || 0;
        
        return {
          id,
          site: info.site,
          port: info.port,
          status,
          uptime: Math.floor(uptime / 1000), // uptime in seconds
          pid: info.process.pid,
          resources: info.resources.current ? {
            cpu: Math.round(info.resources.current.cpu * 10) / 10, // Round to 1 decimal
            memory: info.resources.current.memory,
            memoryMB: Math.round(info.resources.current.memory / 1024 / 1024 * 10) / 10
          } : undefined,
          healthChecks: {
            total: info.healthChecks.total,
            failed: info.healthChecks.failed,
            consecutiveFailed: info.healthChecks.consecutiveFailed,
            lastCheck: info.healthChecks.lastCheck
          },
          restartCount
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

        // Get restart count from history
        const restartCount = this.restartHistory.get(entry.id)?.length || 0;
        
        return {
          id: entry.id,
          site: entry.site,
          port: entry.port,
          status,
          uptime,
          pid: entry.pid,
          restartCount
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
   * Restart a site's processes with enhanced coordination and validation
   * @param site The site name to restart processes for
   * @returns Object with success status and results for each process
   */
  async restartSiteProcesses(site: string): Promise<{
    success: boolean;
    results: { [processId: string]: boolean };
    details: { [processId: string]: string };
  }> {
    const processIds = this.findProcessesBySite(site);
    const results: { [processId: string]: boolean } = {};
    const details: { [processId: string]: string } = {};
    let overallSuccess = true;

    info(
      `Restarting all processes for site: ${site} (found ${processIds.length} processes)`
    );

    if (processIds.length === 0) {
      // Check database for processes that might not be in memory
      try {
        const dbProcesses = processModel.getAll().filter(p => p.site === site);
        if (dbProcesses.length > 0) {
          info(`Found ${dbProcesses.length} processes for site ${site} in database, attempting restart`);
          
          for (const dbProcess of dbProcesses) {
            try {
              const success = await this.startProcess(
                dbProcess.site,
                dbProcess.port,
                dbProcess.script,
                dbProcess.cwd,
                dbProcess.type,
                {} // Environment variables not stored in database
              );
              
              results[dbProcess.id] = success;
              details[dbProcess.id] = success ? "Restarted from database record" : "Failed to restart from database record";
              
              if (!success) {
                overallSuccess = false;
              }
            } catch (err) {
              results[dbProcess.id] = false;
              details[dbProcess.id] = `Error restarting from database: ${err}`;
              overallSuccess = false;
            }
          }
        } else {
          details["no-processes"] = `No processes found for site ${site}`;
        }
      } catch (err) {
        error(`Error checking database for site ${site} processes: ${err}`);
        details["database-error"] = `Database error: ${err}`;
      }
      
      return {
        success: overallSuccess,
        results,
        details
      };
    }

    // Restart processes sequentially to avoid port conflicts
    for (const processId of processIds) {
      try {
        info(`Restarting process ${processId} for site ${site}...`);
        
        // Get process info before restart
        const processInfo = this.processes.get(processId);
        const port = processInfo ? processInfo.port : 'unknown';
        
        const success = await this.restartProcess(processId);
        results[processId] = success;

        if (!success) {
          overallSuccess = false;
          const errorMsg = `Failed to restart process ${processId} (port: ${port})`;
          warn(errorMsg);
          details[processId] = errorMsg;
        } else {
          const successMsg = `Successfully restarted process ${processId} (port: ${port})`;
          info(successMsg);
          details[processId] = successMsg;
          
          // Brief pause between restarts to avoid race conditions
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        results[processId] = false;
        overallSuccess = false;
        const errorMsg = `Exception restarting process ${processId}: ${err}`;
        error(errorMsg);
        details[processId] = errorMsg;
      }
    }

    // Final validation - check that all processes are healthy
    if (overallSuccess) {
      info(`Validating health of restarted processes for site ${site}...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for processes to stabilize
      
      for (const processId of processIds) {
        if (results[processId] && !this.isProcessHealthy(processId)) {
          warn(`Process ${processId} appears unhealthy after restart`);
          details[processId] += " (health check failed after restart)";
        }
      }
    }

    const successCount = Object.values(results).filter(Boolean).length;
    info(`Site restart completed for ${site}: ${successCount}/${processIds.length} processes restarted successfully`);

    return {
      success: overallSuccess && processIds.length > 0,
      results,
      details
    };
  }

  /**
   * Check if a process exists and is healthy
   */
  hasProcess(site: string, port: number): boolean {
    const processId = this.generateProcessId(site, port);
    
    // Check in-memory processes first
    if (this.processes.has(processId)) {
      return this.isProcessHealthy(processId);
    }
    
    // Check database for stale records
    try {
      const dbProcess = processModel.getById(processId);
      if (dbProcess && dbProcess.pid) {
        // Quick sync check if the PID is still valid
        try {
          process.kill(dbProcess.pid, 0);
          return true;
        } catch (err) {
          // Process doesn't exist, clean up stale record
          processModel.delete(processId);
          return false;
        }
      }
    } catch (err) {
      debug(`Error checking database for process ${processId}: ${err}`);
    }
    
    return false;
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

          // If more than 3 consecutive failed checks, restart (if policy allows)
          if (info.healthChecks.consecutiveFailed >= 3 && info.restartPolicy.enabled) {
            warn(`Restarting unhealthy process ${id} after ${info.healthChecks.consecutiveFailed} consecutive failures`);
            
            this.restartProcess(id).catch((err) => {
              error(`Failed to restart process ${id}: ${err}`);
            });

            // Reset consecutive failed count after restart attempt
            info.healthChecks.consecutiveFailed = 0;
          } else if (info.healthChecks.consecutiveFailed >= 3) {
            warn(`Process ${id} unhealthy but restart policy disabled`);
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
    
    // Stop resource monitoring interval
    if (this.resourceMonitorInterval) {
      clearInterval(this.resourceMonitorInterval);
      this.resourceMonitorInterval = null;
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
