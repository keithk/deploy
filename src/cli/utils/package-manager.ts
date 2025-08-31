
import { join } from "path";
import { existsSync } from "fs";
import { spawnSync } from "child_process";
import {
  detectPackageManager,
  getPackageManagerCommand
} from "../../core";

/**
 * Check if node_modules exists and install dependencies if needed
 */
export async function ensureNodeModules(sitePath: string): Promise<boolean> {
  const nodeModulesPath = join(sitePath, "node_modules");
  const packageJsonPath = join(sitePath, "package.json");

  // Check if package.json exists
  if (!existsSync(packageJsonPath)) {
    return true; // No package.json, so no dependencies to install
  }

  // Check if node_modules exists
  if (existsSync(nodeModulesPath)) {
    // Check if it's not empty
    try {
      const fs = await import("fs");
      const files = fs.readdirSync(nodeModulesPath);
      if (files.length > 0) {
        return true; // node_modules exists and is not empty
      }
    } catch (error) {
      console.warn(
        `Could not read node_modules directory: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Detect package manager
  const packageManager = detectPackageManager(sitePath);

  // Need to install dependencies
  console.log(`Installing dependencies for site at ${sitePath}...`);

  try {
    const cmdParts = getPackageManagerCommand(packageManager, "install");
    const command = cmdParts[0];
    const args = cmdParts.slice(1);

    const result = spawnSync(command, args, {
      cwd: sitePath,
      stdio: "inherit",
      env: process.env
    });

    if (result.error) {
      console.error(`Error installing dependencies: ${result.error.message}`);
      return false;
    } else if (result.status !== 0) {
      console.error(
        `Dependency installation failed with exit code ${result.status}`
      );
      return false;
    }

    console.log(`Dependencies installed successfully.`);
    return true;
  } catch (error) {
    console.error(
      `Error installing dependencies: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

/**
 * Run a command using the appropriate package manager
 */
export function runPackageManagerCommand(
  sitePath: string,
  scriptName: string,
  env: NodeJS.ProcessEnv = process.env
): { success: boolean; status: number | null } {
  // Detect package manager
  const packageManager = detectPackageManager(sitePath);

  // Get command parts
  const cmdParts = getPackageManagerCommand(packageManager, scriptName);
  const command = cmdParts[0];
  const args = cmdParts.slice(1);

  console.log(
    `Using package manager: ${packageManager} to run "${scriptName}"`
  );

  try {
    const result = spawnSync(command, args, {
      cwd: sitePath,
      stdio: "inherit",
      env
    });

    if (result.error) {
      console.error(`Error running command: ${result.error.message}`);
      return { success: false, status: null };
    }

    return { success: result.status === 0, status: result.status };
  } catch (error) {
    console.error(
      `Error running command: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return { success: false, status: null };
  }
}

// Re-export core functions for convenience
export { detectPackageManager, getPackageManagerCommand };
