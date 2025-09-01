/**
 * Unified command execution utilities for Dial Up Deploy
 * Combines command execution from actions and process management
 */

import { spawn } from 'child_process';
import type { SiteConfig } from '../types';

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

  /**
   * Timeout in milliseconds
   */
  timeout?: number;

  /**
   * Whether to capture output
   */
  silent?: boolean;
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
    if (part && part.includes('=') && !part.startsWith('-')) {
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
 * Execute a command using Bun's spawn
 * @param command The command to execute
 * @param options Options for executing the command
 * @returns Result of the command execution
 */
export async function executeCommand(
  command: string,
  options: ExecuteCommandOptions = {}
): Promise<ExecuteCommandResult> {
  const cwd = options.cwd || process.cwd();
  const optionsEnv = options.env || {};
  const timeout = options.timeout;
  const silent = options.silent || false;

  try {
    // Parse command to extract environment variables
    const { env: commandEnv, cmd } = parseCommand(command);
    
    // Merge environment variables: process.env + options.env + command env vars
    const mergedEnv = { ...process.env, ...optionsEnv, ...commandEnv };

    const proc = Bun.spawn({
      cmd,
      cwd,
      env: mergedEnv,
      stdout: silent ? "ignore" : "pipe",
      stderr: silent ? "ignore" : "pipe"
    });

    // Set up timeout if specified
    let timeoutId: NodeJS.Timeout | undefined;
    if (timeout) {
      timeoutId = setTimeout(() => {
        proc.kill();
      }, timeout);
    }

    // Collect stdout and stderr
    let stdout = "";
    let stderr = "";

    if (!silent) {
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
    }

    const exitCode = await proc.exited;

    // Clear timeout if it was set
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

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
 * Execute a command using Node's child_process.spawn (for compatibility)
 * @param command The command to execute
 * @param args Command arguments
 * @param options Options for executing the command
 * @returns Result of the command execution
 */
export async function spawnCommand(
  command: string,
  args: string[] = [],
  options: ExecuteCommandOptions = {}
): Promise<ExecuteCommandResult> {
  return new Promise((resolve) => {
    const cwd = options.cwd || process.cwd();
    const env = { ...process.env, ...options.env };
    const timeout = options.timeout;
    const silent = options.silent || false;

    const child = spawn(command, args, {
      cwd,
      env,
      shell: true
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Set up timeout if specified
    let timeoutId: NodeJS.Timeout | undefined;
    if (timeout) {
      timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
      }, timeout);
    }

    if (!silent) {
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (killed) {
        resolve({
          success: false,
          message: `Command timed out after ${timeout}ms`,
          data: { stdout, stderr, exitCode: -1 }
        });
      } else if (code === 0) {
        resolve({
          success: true,
          message: 'Command executed successfully',
          data: { stdout, stderr, exitCode: code || 0 }
        });
      } else {
        resolve({
          success: false,
          message: `Command failed with exit code ${code}`,
          data: { stdout, stderr, exitCode: code || -1 }
        });
      }
    });

    child.on('error', (err) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      resolve({
        success: false,
        message: `Error executing command: ${err.message}`,
        data: { stdout, stderr, exitCode: -1 }
      });
    });
  });
}

/**
 * Build a site with the appropriate build command
 * @param site The site configuration
 * @returns Result of the build operation
 */
export async function buildSite(site: SiteConfig): Promise<ExecuteCommandResult> {
  if (site.type !== "static-build" || !site.commands?.build) {
    return {
      success: false,
      message: `Site ${site.subdomain} is not a static-build site or has no build command`
    };
  }

  const command = site.commands.build;
  const result = await executeCommand(command, {
    cwd: site.path
  });

  if (result.success) {
    return {
      success: true,
      message: `Successfully built site ${site.subdomain}`,
      data: result.data
    };
  } else {
    return {
      success: false,
      message: `Failed to build site ${site.subdomain}: ${result.message}`,
      data: result.data
    };
  }
}

/**
 * Run a script for a site (dev, start, etc.)
 * @param site The site configuration
 * @param script The script name to run
 * @returns Result of the script execution
 */
export async function runSiteScript(
  site: SiteConfig,
  script: string
): Promise<ExecuteCommandResult> {
  const command = site.commands?.[script];
  
  if (!command) {
    return {
      success: false,
      message: `Site ${site.subdomain} has no ${script} script`
    };
  }

  const result = await executeCommand(command, {
    cwd: site.path,
    env: {
      PORT: String(site.devPort || site.proxyPort || 3000)
    }
  });

  if (result.success) {
    return {
      success: true,
      message: `Successfully ran ${script} for site ${site.subdomain}`,
      data: result.data
    };
  } else {
    return {
      success: false,
      message: `Failed to run ${script} for site ${site.subdomain}: ${result.message}`,
      data: result.data
    };
  }
}

// Export for backward compatibility
export { ExecuteCommandOptions as CommandOptions };
export { ExecuteCommandResult as CommandResult };