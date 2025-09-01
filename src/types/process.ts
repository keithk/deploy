/**
 * Types for process management
 */

/**
 * Process registry entry
 */
export interface ProcessRegistryEntry {
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
 * Process information
 */
export interface ProcessInfo {
  id: string;
  site: string;
  port: number;
  pid?: number;
  status: string;
  uptime: number;
  type: string;
  script: string;
  cwd: string;
  env: Record<string, string>;
  startTime: Date;
  lastRestart?: Date;
  // Enhanced fields for monitoring
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
 * Options for starting a process
 */
export interface StartProcessOptions {
  site: string;
  port: number;
  script: string;
  cwd: string;
  type?: string;
  env?: Record<string, string>;
}

/**
 * Result of a process operation
 */
export interface ProcessResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Process manager interface
 */
export interface ProcessManager {
  /**
   * Start a process
   */
  startProcess(options: StartProcessOptions): Promise<ProcessResult>;

  /**
   * Stop a process
   */
  stopProcess(processId: string): Promise<ProcessResult>;

  /**
   * Restart a process
   */
  restartProcess(processId: string): Promise<ProcessResult>;

  /**
   * Get all processes
   */
  getProcesses(): ProcessInfo[];

  /**
   * Get a process by ID
   */
  getProcess(processId: string): ProcessInfo | undefined;

  /**
   * Check if a process is running
   */
  isProcessRunning(processId: string): boolean;

  /**
   * Restart all processes for a site
   */
  restartSiteProcesses(site: string): Promise<{
    success: boolean;
    results: { [processId: string]: boolean };
  }>;

  /**
   * Get resource usage for a process
   */
  getProcessResources(processId: string): { cpu: number; memory: number } | null;

  /**
   * Get average resource usage over time period
   */
  getAverageResources(processId: string, minutes?: number): { cpu: number; memory: number } | null;

  /**
   * Get health check statistics for a process
   */
  getHealthStats(processId: string): {
    total: number;
    failed: number;
    successRate: number;
    consecutiveFailed: number;
    lastCheck?: Date;
  } | null;

  /**
   * Get processes by site
   */
  getProcessesBySite(site: string): ProcessInfo[];

  /**
   * Get processes by status
   */
  getProcessesByStatus(status: string): ProcessInfo[];

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
  };
}
