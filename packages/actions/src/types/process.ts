/**
 * Types for process management
 */

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
}
