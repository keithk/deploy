import {
  ProcessInfo,
  ProcessManager,
  ProcessResult,
  StartProcessOptions
} from "../types/process";

/**
 * Process manager singleton
 * This is a wrapper around the server's process manager
 */
class ProcessManagerImpl implements ProcessManager {
  private serverProcessManager: any;

  constructor() {
    // The actual process manager will be set later
    this.serverProcessManager = null;
  }

  /**
   * Set the server process manager
   * This is called by the server when it initializes the actions package
   */
  setServerProcessManager(processManager: any): void {
    this.serverProcessManager = processManager;
  }

  /**
   * Check if the process manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.serverProcessManager) {
      throw new Error(
        "Process manager not initialized. This method can only be called from within the server context."
      );
    }
  }

  /**
   * Start a process
   */
  async startProcess(options: StartProcessOptions): Promise<ProcessResult> {
    this.ensureInitialized();

    try {
      const success = await this.serverProcessManager.startProcess(
        options.site,
        options.port,
        options.script,
        options.cwd,
        options.type || "site",
        options.env || {}
      );

      return {
        success,
        message: success
          ? `Successfully started process for ${options.site} on port ${options.port}`
          : `Failed to start process for ${options.site} on port ${options.port}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Error starting process: ${
          error instanceof Error ? error.message : String(error)
        }`
      };
    }
  }

  /**
   * Stop a process
   */
  async stopProcess(processId: string): Promise<ProcessResult> {
    this.ensureInitialized();

    try {
      const success = await this.serverProcessManager.stopProcess(processId);

      return {
        success,
        message: success
          ? `Successfully stopped process ${processId}`
          : `Failed to stop process ${processId}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Error stopping process: ${
          error instanceof Error ? error.message : String(error)
        }`
      };
    }
  }

  /**
   * Restart a process
   */
  async restartProcess(processId: string): Promise<ProcessResult> {
    this.ensureInitialized();

    try {
      const success = await this.serverProcessManager.restartProcess(processId);

      return {
        success,
        message: success
          ? `Successfully restarted process ${processId}`
          : `Failed to restart process ${processId}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Error restarting process: ${
          error instanceof Error ? error.message : String(error)
        }`
      };
    }
  }

  /**
   * Get all processes
   */
  getProcesses(): ProcessInfo[] {
    this.ensureInitialized();

    try {
      const processes = this.serverProcessManager.getProcesses();
      return processes.map((p: any) => ({
        id: p.id,
        site: p.site,
        port: p.port,
        pid: p.pid,
        status: p.status,
        uptime: p.uptime,
        type: p.type || "unknown",
        script: p.script || "",
        cwd: p.cwd || "",
        env: p.env || {},
        startTime: new Date(Date.now() - p.uptime * 1000),
        lastRestart: p.lastRestart ? new Date(p.lastRestart) : undefined
      }));
    } catch (error) {
      console.error(`Error getting processes: ${error}`);
      return [];
    }
  }

  /**
   * Get a process by ID
   */
  getProcess(processId: string): ProcessInfo | undefined {
    this.ensureInitialized();

    try {
      // The server's process manager doesn't have a direct getProcess method that takes an ID,
      // so we'll get all processes and find the one we want
      const processes = this.getProcesses();
      return processes.find((p) => p.id === processId);
    } catch (error) {
      console.error(`Error getting process ${processId}: ${error}`);
      return undefined;
    }
  }

  /**
   * Check if a process is running
   */
  isProcessRunning(processId: string): boolean {
    this.ensureInitialized();

    try {
      return this.serverProcessManager.isProcessHealthy(processId);
    } catch (error) {
      console.error(
        `Error checking if process ${processId} is running: ${error}`
      );
      return false;
    }
  }

  /**
   * Restart all processes for a site
   */
  async restartSiteProcesses(site: string): Promise<{
    success: boolean;
    results: { [processId: string]: boolean };
  }> {
    this.ensureInitialized();

    try {
      return await this.serverProcessManager.restartSiteProcesses(site);
    } catch (error) {
      console.error(`Error restarting site processes for ${site}: ${error}`);
      return {
        success: false,
        results: {}
      };
    }
  }
}

// Create a singleton instance
export const processManager = new ProcessManagerImpl();
