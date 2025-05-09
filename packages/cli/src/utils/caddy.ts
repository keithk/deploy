
import { join, resolve } from "path";
import { debug, info, error, warn } from "@dialup-deploy/core";

/**
 * Check if Caddy is installed
 */
export async function isCaddyInstalled(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", "caddy"], {
      stdio: ["ignore", "ignore", "ignore"]
    });
    return (await proc.exited) === 0;
  } catch (error) {
    return false;
  }
}

/**
 * Check if Caddy is running
 */
export async function isCaddyRunning(): Promise<boolean> {
  try {
    // Use pgrep to find Caddy processes
    const proc = Bun.spawn(["pgrep", "caddy"], {
      stdio: ["ignore", "pipe", "ignore"]
    });

    // Check the exit code AND if there's actual output
    const exitCode = await proc.exited;
    const output = await new Response(proc.stdout).text();

    // pgrep returns exit code 0 only if processes were found
    // and the output will contain the PIDs
    return exitCode === 0 && output.trim().length > 0;
  } catch (error) {
    // If pgrep fails for some reason, try an alternative approach
    try {
      const proc = Bun.spawn(["ps", "aux"], {
        stdio: ["ignore", "pipe", "ignore"]
      });
      const output = await new Response(proc.stdout).text();

      // Look for caddy process specifically, not just the string "caddy"
      // This regex looks for lines that contain /caddy or caddy as a command
      return /\s(\/.*\/caddy|caddy)\s/.test(output);
    } catch (e) {
      return false;
    }
  }
}

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

  // Get the Caddyfile path
  const caddyfilePath = getCaddyfilePath();
  if (!(await Bun.file(caddyfilePath).exists())) {
    warn("Caddyfile not found. Please run setup script first.");
    return false;
  }

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
 * Reload Caddy configuration
 */
export async function reloadCaddy(): Promise<boolean> {
  info("Reloading Caddy configuration...");

  if (!(await isCaddyRunning())) {
    info("Caddy is not running. Starting instead...");
    return startCaddy();
  }

  try {
    const caddyfilePath = getCaddyfilePath();

    // Reload configuration
    const proc = Bun.spawn(
      ["caddy", "reload", "--config", caddyfilePath, "--adapter", "caddyfile"],
      {
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      error(`Failed to reload Caddy (exit code ${exitCode}):`, stderr);
      return false;
    }

    info("Caddy configuration reloaded successfully.");
    return true;
  } catch (err) {
    error(
      `Failed to reload Caddy: ${
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

  const caddyfilePath = resolve("Caddyfile.production");
  if (!(await Bun.file(caddyfilePath).exists())) {
    warn("Caddyfile.production not found. Skipping Caddy startup.");
    warn("If you need HTTPS support, run setup script first.");
    return false;
  }

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
