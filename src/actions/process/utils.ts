import { processManager } from "./manager";
import { ProcessResult, StartProcessOptions } from "../types/process";

/**
 * Start a process
 * @param options Options for starting the process
 * @returns Result of the operation
 */
export async function startProcess(
  options: StartProcessOptions
): Promise<ProcessResult> {
  return processManager.startProcess(options);
}

/**
 * Stop a process
 * @param processId ID of the process to stop
 * @returns Result of the operation
 */
export async function stopProcess(processId: string): Promise<ProcessResult> {
  return processManager.stopProcess(processId);
}

/**
 * Restart a process
 * @param processId ID of the process to restart
 * @returns Result of the operation
 */
export async function restartProcess(
  processId: string
): Promise<ProcessResult> {
  return processManager.restartProcess(processId);
}

/**
 * Get all processes
 * @returns Array of process information
 */
export function getProcesses() {
  return processManager.getProcesses();
}

/**
 * Get a process by ID
 * @param processId ID of the process to get
 * @returns Process information or undefined if not found
 */
export function getProcess(processId: string) {
  return processManager.getProcess(processId);
}

/**
 * Check if a process is running
 * @param processId ID of the process to check
 * @returns True if the process is running, false otherwise
 */
export function isProcessRunning(processId: string): boolean {
  return processManager.isProcessRunning(processId);
}

/**
 * Restart all processes for a site
 * @param site Name of the site
 * @returns Result of the operation
 */
export async function restartSiteProcesses(site: string): Promise<{
  success: boolean;
  results: { [processId: string]: boolean };
}> {
  return processManager.restartSiteProcesses(site);
}
