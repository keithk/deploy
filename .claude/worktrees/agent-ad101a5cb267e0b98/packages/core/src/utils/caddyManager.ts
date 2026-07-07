// ABOUTME: Caddy server management utilities for writing config and reloading.
// ABOUTME: Provides functions to update Caddyfile and reload Caddy across dev/production.

import { join, resolve } from "path";
import { generateCaddyfileContent, generateSimpleCaddyfile } from "./caddyfile";
import { debug, info, warn, error } from "./logging";

export interface CaddyConfig {
  domain: string;
  sitesDir?: string;
  port?: number;
  caddyfilePath?: string;
  useSimpleConfig?: boolean;
}

export interface CaddyResult {
  success: boolean;
  message: string;
  caddyfilePath?: string;
}

/**
 * Check if Caddy is installed
 */
export async function isCaddyInstalled(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", "caddy"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

/**
 * Check if Caddy is running
 */
export async function isCaddyRunning(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["pgrep", "caddy"], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    const exitCode = await proc.exited;
    const output = await new Response(proc.stdout).text();

    return exitCode === 0 && output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if systemd is available (indicates production Linux environment)
 */
export async function hasSystemd(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", "systemctl"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

/**
 * Check if running in production environment
 */
export function isProductionEnvironment(): boolean {
  return process.platform === "linux" && process.env.NODE_ENV === "production";
}

/**
 * Get the default Caddyfile path based on environment
 */
export async function getDefaultCaddyfilePath(projectRoot?: string): Promise<string> {
  // In production Linux with systemd, use /etc/caddy/Caddyfile
  if (process.platform === "linux" && (await hasSystemd())) {
    return "/etc/caddy/Caddyfile";
  }
  // Otherwise use local config directory
  const root = projectRoot || process.cwd();
  return join(root, "config", "Caddyfile");
}

/**
 * Write Caddyfile content to disk
 */
export async function writeCaddyfile(
  content: string,
  path: string
): Promise<CaddyResult> {
  try {
    // Ensure directory exists
    const dir = path.substring(0, path.lastIndexOf("/"));
    await Bun.spawn(["mkdir", "-p", dir], {
      stdio: ["ignore", "ignore", "ignore"],
    }).exited;

    await Bun.write(path, content);

    return {
      success: true,
      message: `Caddyfile written to ${path}`,
      caddyfilePath: path,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to write Caddyfile: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Reload Caddy configuration
 */
export async function reloadCaddy(caddyfilePath?: string): Promise<CaddyResult> {
  if (!(await isCaddyRunning())) {
    return {
      success: true,
      message: "Caddy is not running, no reload needed",
    };
  }

  const configPath = caddyfilePath || (await getDefaultCaddyfilePath());

  // Use systemctl on production Linux
  if (process.platform === "linux" && (await hasSystemd())) {
    return reloadCaddyProduction();
  }

  try {
    const proc = Bun.spawn(
      ["caddy", "reload", "--config", configPath, "--adapter", "caddyfile"],
      {
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return {
        success: false,
        message: `Caddy reload failed: ${stderr}`,
      };
    }

    return {
      success: true,
      message: "Caddy configuration reloaded",
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to reload Caddy: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Reload Caddy in production environment (via systemctl)
 */
export async function reloadCaddyProduction(): Promise<CaddyResult> {
  if (!(await hasSystemd())) {
    return {
      success: false,
      message: "systemd not available, cannot reload production Caddy",
    };
  }

  try {
    const proc = Bun.spawn(["sudo", "systemctl", "reload", "caddy"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return {
        success: false,
        message: `Production Caddy reload failed: ${stderr}`,
      };
    }

    return {
      success: true,
      message: "Production Caddy configuration reloaded",
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to reload production Caddy: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Generate, write, and reload Caddyfile in one operation
 */
export async function updateCaddyConfig(
  config: CaddyConfig
): Promise<CaddyResult> {
  const {
    domain,
    sitesDir = "./sites",
    port = 3000,
    caddyfilePath,
    useSimpleConfig = true,
  } = config;

  debug(`Updating Caddy config for domain: ${domain}`);

  // Generate Caddyfile content
  let content: string;
  try {
    if (useSimpleConfig) {
      content = generateSimpleCaddyfile(domain, port);
    } else {
      content = await generateCaddyfileContent(domain, sitesDir, {
        info: (msg) => debug(`Caddyfile: ${msg}`),
        warning: (msg) => warn(`Caddyfile: ${msg}`),
      });
    }
  } catch (err) {
    return {
      success: false,
      message: `Failed to generate Caddyfile: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Determine output path - use provided path or detect based on environment
  const outputPath = caddyfilePath || (await getDefaultCaddyfilePath());

  // Write the Caddyfile
  const writeResult = await writeCaddyfile(content, outputPath);
  if (!writeResult.success) {
    return writeResult;
  }

  // Reload Caddy if running
  const reloadResult = await reloadCaddy(outputPath);
  if (!reloadResult.success && reloadResult.message.includes("not running")) {
    // Not an error if Caddy isn't running
    return {
      success: true,
      message: `Caddyfile updated at ${outputPath}. Caddy not running, will use new config on next start.`,
      caddyfilePath: outputPath,
    };
  }

  if (!reloadResult.success) {
    return {
      success: false,
      message: `Caddyfile written but reload failed: ${reloadResult.message}`,
      caddyfilePath: outputPath,
    };
  }

  return {
    success: true,
    message: `Caddyfile updated and Caddy reloaded`,
    caddyfilePath: outputPath,
  };
}
