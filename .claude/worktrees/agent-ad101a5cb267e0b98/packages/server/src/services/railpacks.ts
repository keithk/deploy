// ABOUTME: Build service using Railpack to create Docker images from source code.
// ABOUTME: Wraps the railpack CLI to build container images with automatic detection.

import { spawn } from "bun";
import { existsSync } from "fs";
import { info, debug, error, settingsModel } from "@keithk/deploy-core";

export interface BuildResult {
  success: boolean;
  imageName: string;
  error?: string;
}

export interface BuildOptions {
  /** CPU nice level (0-19, higher = lower priority). Default: 10 */
  niceLevel?: number;
  /** IO scheduling class: 'idle', 'best-effort', 'realtime'. Default: 'idle' */
  ioClass?: "idle" | "best-effort" | "realtime";
  /** BuildKit max parallelism (number of concurrent operations). Default: 2 */
  maxParallelism?: number;
}

/**
 * Get build options from settings or environment, with defaults
 */
function getBuildOptions(): BuildOptions {
  return {
    niceLevel: parseInt(settingsModel.get("build_nice_level") || process.env.BUILD_NICE_LEVEL || "10", 10),
    ioClass: (settingsModel.get("build_io_class") || process.env.BUILD_IO_CLASS || "idle") as BuildOptions["ioClass"],
    maxParallelism: parseInt(settingsModel.get("build_max_parallelism") || process.env.BUILD_MAX_PARALLELISM || "2", 10),
  };
}

/**
 * Build a site using Railpack
 * Railpack automatically detects the language/framework and builds a container image
 * @param sitePath Path to the site source code
 * @param siteName Name of the site (used for image naming)
 * @param options Optional build resource options
 * @returns BuildResult with success status and image name
 */
export async function buildWithRailpacks(
  sitePath: string,
  siteName: string,
  options?: BuildOptions
): Promise<BuildResult> {
  const imageName = `deploy-${siteName}:latest`;

  if (!existsSync(sitePath)) {
    const message = `Site path does not exist: ${sitePath}`;
    error(message);
    return { success: false, imageName, error: message };
  }

  const opts = { ...getBuildOptions(), ...options };
  info(`Building ${siteName} with Railpack (nice=${opts.niceLevel}, io=${opts.ioClass}, parallelism=${opts.maxParallelism})`);

  try {
    // Map IO class to ionice class number
    const ioClassMap = { realtime: 1, "best-effort": 2, idle: 3 };
    const ioClassNum = ioClassMap[opts.ioClass || "idle"];

    // Build the command with nice and ionice for resource limiting
    const command = [
      "nice", "-n", String(opts.niceLevel || 10),
      "ionice", "-c", String(ioClassNum),
      "railpack", "build", sitePath, "--name", imageName
    ];

    // Set up environment with BuildKit parallelism limit
    const env = {
      ...process.env,
      BUILDKIT_MAX_PARALLELISM: String(opts.maxParallelism || 2),
    };

    const proc = spawn(command, {
      stdout: "pipe",
      stderr: "pipe",
      env,
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(stderr || `Exit code ${exitCode}`);
    }

    debug(`Successfully built image ${imageName}`);
    return { success: true, imageName };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to build ${siteName}: ${message}`);
    return { success: false, imageName, error: `Railpack build failed: ${message}` };
  }
}
