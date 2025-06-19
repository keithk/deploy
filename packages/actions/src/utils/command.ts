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

// This will be set by the server when it initializes the actions package
let serverBuildSite: (
  site: any,
  context: any
) => Promise<{ success: boolean; message: string }>;

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
 * Set the server's buildSite function
 * This is called by the server when it initializes the actions package
 */
export function setServerBuildSite(
  fn: (
    site: any,
    context: any
  ) => Promise<{ success: boolean; message: string }>
): void {
  serverBuildSite = fn;
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
    // Fallback implementation for CLI usage
    return await executeCommandFallback(command, options);
  }

  return serverExecuteCommand(command, options);
}

/**
 * Parse command string to separate environment variables from the actual command
 */
function parseCommand(command: string): { env: Record<string, string>; cmd: string[] } {
  const parts = command.trim().split(/\s+/);
  const env: Record<string, string> = {};
  let cmdStart = 0;

  // Look for environment variable assignments at the beginning
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.includes('=') && !part.startsWith('-')) {
      const [key, ...valueParts] = part.split('=');
      if (key && valueParts.length > 0) {
        env[key] = valueParts.join('=');
        cmdStart = i + 1;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  const cmd = parts.slice(cmdStart);
  return { env, cmd };
}

/**
 * Fallback implementation of executeCommand for CLI usage
 */
async function executeCommandFallback(
  command: string,
  options: ExecuteCommandOptions = {}
): Promise<ExecuteCommandResult> {
  const cwd = options.cwd || process.cwd();
  const optionsEnv = options.env || {};

  try {
    // Parse command to extract environment variables
    const { env: commandEnv, cmd } = parseCommand(command);
    
    // Merge environment variables: process.env + options.env + command env vars
    const mergedEnv = { ...process.env, ...optionsEnv, ...commandEnv };

    const proc = Bun.spawn({
      cmd,
      cwd,
      env: mergedEnv,
      stdout: "pipe",
      stderr: "pipe"
    });

    // Collect stdout and stderr
    let stdout = "";
    let stderr = "";

    if (proc.stdout) {
      const reader = proc.stdout.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        stdout += text;
      }
    }

    if (proc.stderr) {
      const reader = proc.stderr.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        stderr += text;
      }
    }

    const exitCode = await proc.exited;

    if (exitCode === 0) {
      return {
        success: true,
        message: `Command executed successfully`,
        data: { stdout, stderr, exitCode }
      };
    } else {
      return {
        success: false,
        message: `Command failed with exit code ${exitCode}`,
        data: { stdout, stderr, exitCode }
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `Error executing command: ${err}`,
      data: { stdout: "", stderr: String(err), exitCode: -1 }
    };
  }
}

/**
 * Build a site
 * @param site The site configuration
 * @param context The action context
 * @returns Result of the build operation
 */
export async function buildSite(
  site: any,
  context: any
): Promise<{ success: boolean; message: string }> {
  if (!serverBuildSite) {
    // Fallback implementation for CLI usage
    return await buildSiteFallback(site, context);
  }

  return serverBuildSite(site, context);
}

/**
 * Fallback implementation of buildSite for CLI usage
 */
async function buildSiteFallback(
  site: any,
  context: any
): Promise<{ success: boolean; message: string }> {
  if (site.type !== "static-build" || !site.commands?.build) {
    return {
      success: false,
      message: `Site ${site.subdomain} is not a static-build site or has no build command`
    };
  }

  // Simple build implementation without cache
  const command = site.commands.build;
  const result = await executeCommandFallback(command, {
    cwd: site.path
  });

  if (result.success) {
    return {
      success: true,
      message: `Successfully built site ${site.subdomain}`
    };
  } else {
    return {
      success: false,
      message: `Failed to build site ${site.subdomain}: ${result.message}`
    };
  }
}
