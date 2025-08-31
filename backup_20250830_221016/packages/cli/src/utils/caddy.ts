
import { join, resolve } from "path";
import { debug, info, error, warn } from "@keithk/deploy-core";
import { DEPLOY_PATHS, LEGACY_PATHS } from "@keithk/deploy-core/src/config/paths";

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
  // Use the centralized path configuration
  return DEPLOY_PATHS.caddyfile;
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
    ? DEPLOY_PATHS.caddyfileProduction
    : getCaddyfilePath();

  // Handle migration from legacy locations
  const legacyPath = mode === 'production' 
    ? LEGACY_PATHS.oldCaddyfileProduction
    : LEGACY_PATHS.oldCaddyfile;

  if (!await Bun.file(caddyfilePath).exists() && await Bun.file(legacyPath).exists()) {
    info(`Migrating ${mode} Caddyfile from legacy location...`);
    try {
      // Ensure the new directory exists
      await Bun.write(join(DEPLOY_PATHS.caddyDir, '.gitkeep'), '');
      
      // Move the file
      const legacyContent = await Bun.file(legacyPath).text();
      await Bun.write(caddyfilePath, legacyContent);
      
      // Remove the legacy file
      const proc = Bun.spawn(['rm', legacyPath], { stdio: ['ignore', 'ignore', 'ignore'] });
      await proc.exited;
      
      info(`${mode} Caddyfile migrated successfully`);
    } catch (err) {
      warn(`Failed to migrate ${mode} Caddyfile: ${err}`);
    }
  }

  if (!(await Bun.file(caddyfilePath).exists())) {
    if (mode === 'dev') {
      info("Caddyfile not found. Attempting to generate local development configuration...");
      try {
        // Use the local development configuration from setup-utils
        const { configureCaddy } = await import("../utils/setup-utils");
        const domain = await getDomain();
        const projectRoot = resolve(process.cwd());
        
        const success = await configureCaddy(domain, projectRoot, DEPLOY_PATHS.caddyDir, true, {
          info: (msg: string) => debug(`Caddy setup: ${msg}`),
          success: (msg: string) => debug(`Caddy setup: ${msg}`),
          warning: (msg: string) => debug(`Caddy setup warning: ${msg}`),
          error: (msg: string) => warn(`Caddy setup error: ${msg}`),
          step: (msg: string) => debug(`Caddy setup step: ${msg}`)
        });
        
        if (success) {
          info(`Generated local development Caddyfile at ${caddyfilePath}`);
          return true;
        } else {
          warn("Failed to generate local development Caddyfile");
          return false;
        }
      } catch (err) {
        warn(`Failed to generate Caddyfile: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    } else {
      warn(`Production Caddyfile not found at ${caddyfilePath}`);
      info("Run 'deploy setup production' to generate production configuration.");
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

  if (!(await isCaddyRunning())) {
    debug("Caddy is not running. Cannot reload configuration.");
    return false;
  }

  try {
    const caddyfilePath = getCaddyfilePath();
    
    // Ensure Caddyfile exists
    if (!(await ensureCaddyfileExists('dev'))) {
      warn("Caddyfile does not exist and could not be generated");
      return false;
    }

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

    debug("Caddy configuration reloaded successfully.");
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
 * Reload Caddy configuration for production
 */
export async function reloadCaddyProduction(): Promise<boolean> {
  debug("Reloading Caddy production configuration...");

  if (!(await isCaddyRunning())) {
    debug("Caddy is not running. Cannot reload configuration.");
    return false;
  }

  try {
    const caddyfilePath = DEPLOY_PATHS.caddyfileProduction;
    
    // Ensure production Caddyfile exists
    if (!(await ensureCaddyfileExists('production'))) {
      warn("Production Caddyfile does not exist");
      return false;
    }

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
      error(`Failed to reload production Caddy (exit code ${exitCode}):`, stderr);
      return false;
    }

    debug("Caddy production configuration reloaded successfully.");
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
  
  const caddyfilePath = DEPLOY_PATHS.caddyfileProduction;

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
