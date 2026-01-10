// ABOUTME: CLI utilities for Caddy server management.
// ABOUTME: Re-exports core utilities and adds CLI-specific functions.

import { join, resolve } from "path";
import {
  debug,
  info,
  error,
  warn,
  isCaddyInstalled,
  isCaddyRunning,
  reloadCaddy as coreReloadCaddy,
} from "@keithk/deploy-core";

// Re-export core utilities
export { isCaddyInstalled, isCaddyRunning };

/**
 * Get the domain from .env file or use default
 */
export async function getDomain(): Promise<string> {
  let domain = "dev.flexi";
  try {
    const envPath = join(process.cwd(), ".env");
    if (await Bun.file(envPath).exists()) {
      const envContent = await Bun.file(envPath).text();
      const domainMatch = envContent.match(/PROJECT_DOMAIN=([^\s]+)/);
      if (domainMatch && domainMatch[1]) {
        domain = domainMatch[1];
      }
    }
  } catch (err) {
    warn(
      `Could not read .env file: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    warn(`Using default domain: ${domain}`);
  }
  return domain;
}

/**
 * Get path to the project's Caddyfile
 */
export function getCaddyfilePath(): string {
  const projectRoot = resolve(process.cwd());
  // Ensure the path is absolute
  if (!projectRoot.startsWith("/")) {
    throw new Error("Project root is not an absolute path.");
  }

  return join(projectRoot, "config", "Caddyfile");
}

/**
 * Start Caddy with the project's Caddyfile
 */
export async function startCaddy(): Promise<boolean> {
  info("Starting Caddy server...");

  // Check if Caddy is already running
  if (await isCaddyRunning()) {
    info("Caddy is already running. Stopping existing process...");
    await stopCaddy();

    // Wait a moment for the process to fully stop
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Check if Caddy is installed
  if (!(await isCaddyInstalled())) {
    warn("Caddy is not installed. Please run setup script first.");
    warn(`Could not find file at ${getCaddyfilePath()}`);
    return false;
  }

  // Ensure Caddyfile exists
  if (!(await ensureCaddyfileExists('dev'))) {
    warn("Caddyfile not found and could not be generated. Please run setup script first.");
    return false;
  }
  
  const caddyfilePath = getCaddyfilePath();

  // Start Caddy with the project's Caddyfile
  try {
    info(`Starting Caddy with config: ${caddyfilePath}`);

    // Use Bun.spawn to run in the background
    const proc = Bun.spawn({
      cmd: [
        "caddy",
        "run",
        "--config",
        caddyfilePath,
        "--adapter",
        "caddyfile"
      ],
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    // Wait a moment to see if Caddy starts successfully
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check if Caddy is now running
    if (await isCaddyRunning()) {
      info("Caddy started successfully.");
      return true;
    } else {
      // Check for error output
      try {
        const stderr = await new Response(proc.stderr).text();
        if (stderr) {
          error("Error starting Caddy:", stderr);
        }
      } catch (e) {
        // Ignore errors reading stderr
      }

      warn("Caddy may not have started properly.");
      info("You can manually start Caddy with:");
      info(`caddy run --config ${caddyfilePath} --adapter caddyfile`);
      return false;
    }
  } catch (err) {
    error(
      `Failed to start Caddy: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

/**
 * Stop running Caddy server
 */
export async function stopCaddy(): Promise<boolean> {
  info("Stopping Caddy server...");

  if (!(await isCaddyRunning())) {
    info("Caddy is not running.");
    return true;
  }

  try {
    // Try graceful stop first
    const proc = Bun.spawn(["caddy", "stop"], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    await proc.exited;

    // Check if it's still running
    if (await isCaddyRunning()) {
      info("Graceful stop failed. Using pkill...");

      // Force kill
      const killProc = Bun.spawn(["pkill", "-f", "caddy"], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      await killProc.exited;

      // Final check
      if (await isCaddyRunning()) {
        error("Failed to stop Caddy.");
        return false;
      }
    }

    info("Caddy stopped successfully.");
    return true;
  } catch (err) {
    error(
      `Failed to stop Caddy: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

/**
 * Ensure Caddyfile exists and generate if needed for dev mode
 */
async function ensureCaddyfileExists(mode: 'dev' | 'production'): Promise<boolean> {
  const caddyfilePath = mode === 'production' 
    ? join(process.cwd(), "Caddyfile.production")
    : getCaddyfilePath();

  if (!(await Bun.file(caddyfilePath).exists())) {
    if (mode === 'dev') {
      info("Caddyfile not found. Attempting to generate one...");
      try {
        // Import generateCaddyfileContent function
        const { generateCaddyfileContent } = await import("@keithk/deploy-core");
        const domain = await getDomain();
        const rootDir = process.env.ROOT_DIR || "./sites";
        
        const caddyfileContent = await generateCaddyfileContent(domain, rootDir, {
          info: (msg: string) => debug(`Caddyfile gen: ${msg}`),
          warning: (msg: string) => debug(`Caddyfile gen warning: ${msg}`)
        });
        
        await Bun.write(caddyfilePath, caddyfileContent);
        info(`Generated Caddyfile at ${caddyfilePath}`);
        return true;
      } catch (err) {
        warn(`Failed to generate Caddyfile: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    } else {
      warn(`Production Caddyfile not found at ${caddyfilePath}`);
      return false;
    }
  }
  return true;
}

/**
 * Reload Caddy configuration
 */
export async function reloadCaddy(): Promise<boolean> {
  debug("Reloading Caddy configuration...");

  // Ensure Caddyfile exists before attempting reload
  if (!(await ensureCaddyfileExists('dev'))) {
    warn("Caddyfile does not exist and could not be generated");
    return false;
  }

  const result = await coreReloadCaddy(getCaddyfilePath());

  if (!result.success) {
    error(result.message);
    return false;
  }

  debug(result.message);
  return true;
}

/**
 * Reload Caddy configuration for production
 * Uses systemctl reload to ensure the correct config path is used
 */
export async function reloadCaddyProduction(): Promise<boolean> {
  info("Reloading Caddy production configuration...");

  if (!(await isCaddyRunning())) {
    info("Caddy is not running. Cannot reload configuration.");
    return false;
  }

  try {
    // Use systemctl reload which uses the correct ExecReload from the unit file
    // Requires sudo since deploy service runs as non-root user
    const proc = Bun.spawn(
      ["sudo", "systemctl", "reload", "caddy"],
      {
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      error(`Failed to reload Caddy via systemctl (exit code ${exitCode}):`, stderr);
      return false;
    }

    info("Caddy configuration reloaded successfully.");
    return true;
  } catch (err) {
    error(
      `Failed to reload production Caddy: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

/**
 * Start Caddy with production configuration
 */
export async function startCaddyProduction(): Promise<boolean> {
  info("Starting Caddy server for production...");

  if (await isCaddyRunning()) {
    info("Caddy is already running. Stopping existing process...");
    await stopCaddy();

    // Wait a moment for the process to fully stop
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!(await isCaddyInstalled())) {
    warn("Caddy is not installed. Please install Caddy first.");
    return false;
  }

  // Ensure production Caddyfile exists
  if (!(await ensureCaddyfileExists('production'))) {
    warn("Caddyfile.production not found. Skipping Caddy startup.");
    warn("If you need HTTPS support, run setup script first.");
    return false;
  }
  
  const caddyfilePath = resolve("Caddyfile.production");

  try {
    info(`Starting Caddy with production config: ${caddyfilePath}`);

    const proc = Bun.spawn({
      cmd: [
        "caddy",
        "run",
        "--config",
        caddyfilePath,
        "--adapter",
        "caddyfile"
      ],
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    // Wait a moment to see if Caddy starts successfully
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check if Caddy is now running
    if (await isCaddyRunning()) {
      info("Caddy started successfully with production configuration.");
      return true;
    } else {
      // Check for error output
      try {
        const stderr = await new Response(proc.stderr).text();
        if (stderr) {
          error("Error starting Caddy:", stderr);
        }
      } catch (e) {
        // Ignore errors reading stderr
      }

      warn("Caddy may not have started properly.");
      info("You can manually start Caddy with:");
      info(`caddy run --config ${caddyfilePath} --adapter caddyfile`);
      return false;
    }
  } catch (err) {
    error(
      `Failed to start Caddy with production configuration: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    info("You can manually start Caddy with:");
    info(`caddy run --config ${caddyfilePath} --adapter caddyfile`);
    return false;
  }
}
