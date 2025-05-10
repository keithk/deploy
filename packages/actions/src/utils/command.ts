/**
 * Command execution utilities
 */

/**
 * Options for executing a command
 */
export interface ExecuteCommandOptions {
  /**
   * Working directory for the command
   */
  cwd?: string;

  /**
   * Environment variables to pass to the command
   */
  env?: Record<string, string>;
}

/**
 * Result of executing a command
 */
export interface ExecuteCommandResult {
  /**
   * Whether the command succeeded
   */
  success: boolean;

  /**
   * Message describing the result
   */
  message: string;

  /**
   * Additional data about the result
   */
  data?: {
    /**
     * Standard output from the command
     */
    stdout?: string;

    /**
     * Standard error from the command
     */
    stderr?: string;

    /**
     * Exit code from the command
     */
    exitCode?: number;
  };
}

// This will be set by the server when it initializes the actions package
let serverExecuteCommand: (
  command: string,
  options: ExecuteCommandOptions
) => Promise<ExecuteCommandResult>;

/**
 * Set the server's executeCommand function
 * This is called by the server when it initializes the actions package
 */
export function setServerExecuteCommand(
  fn: (
    command: string,
    options: ExecuteCommandOptions
  ) => Promise<ExecuteCommandResult>
): void {
  serverExecuteCommand = fn;
}

/**
 * Execute a command
 * @param command The command to execute
 * @param options Options for executing the command
 * @returns Result of the command execution
 */
export async function executeCommand(
  command: string,
  options: ExecuteCommandOptions = {}
): Promise<ExecuteCommandResult> {
  if (!serverExecuteCommand) {
    throw new Error(
      "executeCommand not initialized. This method can only be called from within the server context."
    );
  }

  return serverExecuteCommand(command, options);
}
