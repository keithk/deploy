// ABOUTME: Build service using Railpack to create Docker images from source code.
// ABOUTME: Wraps the railpack CLI to build container images with automatic detection.

import { $ } from "bun";
import { existsSync } from "fs";
import { info, debug, error } from "@keithk/deploy-core";

export interface BuildResult {
  success: boolean;
  imageName: string;
  error?: string;
}

/**
 * Build a site using Railpack
 * Railpack automatically detects the language/framework and builds a container image
 * @param sitePath Path to the site source code
 * @param siteName Name of the site (used for image naming)
 * @returns BuildResult with success status and image name
 */
export async function buildWithRailpacks(
  sitePath: string,
  siteName: string
): Promise<BuildResult> {
  const imageName = `deploy-${siteName}:latest`;

  if (!existsSync(sitePath)) {
    const message = `Site path does not exist: ${sitePath}`;
    error(message);
    return { success: false, imageName, error: message };
  }

  info(`Building ${siteName} with Railpack from ${sitePath}`);

  try {
    await $`railpack build ${sitePath} --name ${imageName}`.quiet();
    debug(`Successfully built image ${imageName}`);
    return { success: true, imageName };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to build ${siteName}: ${message}`);
    return { success: false, imageName, error: `Railpack build failed: ${message}` };
  }
}
