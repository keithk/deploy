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
   * Get all processes with enhanced information
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
        lastRestart: p.lastRestart ? new Date(p.lastRestart) : undefined,
        // Enhanced fields
        resources: p.resources ? {
          cpu: p.resources.cpu,
          memory: p.resources.memory,
          memoryMB: p.resources.memoryMB
        } : undefined,
        healthChecks: p.healthChecks ? {
          total: p.healthChecks.total,
          failed: p.healthChecks.failed,
          consecutiveFailed: p.healthChecks.consecutiveFailed,
          lastCheck: p.healthChecks.lastCheck
        } : undefined,
        restartCount: p.restartCount || 0
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
   * Check if a process is running and healthy
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
   * Get resource usage for a process
   */
  getProcessResources(processId: string): { cpu: number; memory: number } | null {
    this.ensureInitialized();

    try {
      const processes = this.getProcesses();
      const process = processes.find(p => p.id === processId);
      
      if (!process || !process.resources) {
        return null;
      }
      
      return {
        cpu: process.resources.cpu,
        memory: process.resources.memory
      };
    } catch (error) {
      console.error(
        `Error getting resources for process ${processId}: ${error}`
      );
      return null;
    }
  }

  /**
   * Get average resource usage over time period
   */
  getAverageResources(
    processId: string,
    minutes: number = 5
  ): { cpu: number; memory: number } | null {
    this.ensureInitialized();

    try {
      if (typeof this.serverProcessManager.getAverageResources === 'function') {
        return this.serverProcessManager.getAverageResources(processId, minutes);
      }
      
      // Fallback to current resources if historical data not available
      return this.getProcessResources(processId);
    } catch (error) {
      console.error(
        `Error getting average resources for process ${processId}: ${error}`
      );
      return null;
    }
  }

  /**
   * Get health check statistics for a process
   */
  getHealthStats(processId: string): {
    total: number;
    failed: number;
    successRate: number;
    consecutiveFailed: number;
    lastCheck?: Date;
  } | null {
    this.ensureInitialized();

    try {
      const processes = this.getProcesses();
      const process = processes.find(p => p.id === processId);
      
      if (!process || !process.healthChecks) {
        return null;
      }
      
      const { total, failed, consecutiveFailed, lastCheck } = process.healthChecks;
      const successRate = total > 0 ? ((total - failed) / total) * 100 : 0;
      
      return {
        total,
        failed,
        successRate,
        consecutiveFailed,
        lastCheck
      };
    } catch (error) {
      console.error(
        `Error getting health stats for process ${processId}: ${error}`
      );
      return null;
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

  /**
   * Get processes by site
   */
  getProcessesBySite(site: string): ProcessInfo[] {
    this.ensureInitialized();

    try {
      const allProcesses = this.getProcesses();
      return allProcesses.filter(p => p.site === site);
    } catch (error) {
      console.error(`Error getting processes for site ${site}: ${error}`);
      return [];
    }
  }

  /**
   * Get processes by status
   */
  getProcessesByStatus(status: string): ProcessInfo[] {
    this.ensureInitialized();

    try {
      const allProcesses = this.getProcesses();
      return allProcesses.filter(p => p.status === status);
    } catch (error) {
      console.error(`Error getting processes by status ${status}: ${error}`);
      return [];
    }
  }

  /**
   * Get system resource summary
   */
  getSystemResourceSummary(): {
    totalProcesses: number;
    runningProcesses: number;
    totalCpu: number;
    totalMemoryMB: number;
    averageCpu: number;
    averageMemoryMB: number;
  } {
    this.ensureInitialized();

    try {
      const processes = this.getProcesses();
      const runningProcesses = processes.filter(p => p.status === 'running');
      const processesWithResources = runningProcesses.filter(p => p.resources);
      
      const totalCpu = processesWithResources.reduce((sum, p) => sum + (p.resources?.cpu || 0), 0);
      const totalMemoryMB = processesWithResources.reduce((sum, p) => sum + (p.resources?.memoryMB || 0), 0);
      
      return {
        totalProcesses: processes.length,
        runningProcesses: runningProcesses.length,
        totalCpu,
        totalMemoryMB,
        averageCpu: processesWithResources.length > 0 ? totalCpu / processesWithResources.length : 0,
        averageMemoryMB: processesWithResources.length > 0 ? totalMemoryMB / processesWithResources.length : 0
      };
    } catch (error) {
      console.error(`Error getting system resource summary: ${error}`);
      return {
        totalProcesses: 0,
        runningProcesses: 0,
        totalCpu: 0,
        totalMemoryMB: 0,
        averageCpu: 0,
        averageMemoryMB: 0
      };
    }
  }
}

// Create a singleton instance
export const processManager = new ProcessManagerImpl();
