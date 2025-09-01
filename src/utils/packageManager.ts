import { join } from "path";
import { existsSync, readdirSync } from "fs";
import { spawnSync } from "child_process";

/**
 * Detects the package manager used in a project, preferring mise when available.
 * @param sitePath The path to the site directory
 * @returns The detected package manager ('mise', 'bun', 'yarn', 'pnpm', or 'npm')
 */
export function detectPackageManager(sitePath: string): string {
  // Check for mise configuration first
  if (existsSync(join(sitePath, ".mise.toml"))) {
    return "mise";
  }
  
  // Fallback to traditional lock file detection
  if (existsSync(join(sitePath, "bun.lock"))) {
    return "bun";
  } else if (existsSync(join(sitePath, "yarn.lock"))) {
    return "yarn";
  } else if (existsSync(join(sitePath, "pnpm-lock.yaml"))) {
    return "pnpm";
  } else {
    return "npm";
  }
}

/**
 * Generates the appropriate command array for running a script with the detected package manager.
 * @param packageManager The package manager to use
 * @param script The script name to run
 * @param args Additional arguments to pass to the script
 * @returns An array of command parts to be used with Bun.spawn
 */
export function getPackageManagerCommand(
  packageManager: string,
  script: string,
  args: string[] = []
): string[] {
  switch (packageManager) {
    case "mise":
      return ["mise", "run", script, ...args];
    case "yarn":
      return ["yarn", script, ...args];
    case "pnpm":
      return ["pnpm", "run", script, "--", ...args];
    case "bun":
      return ["bun", "run", script, ...args];
    case "npm":
    default:
      return ["npm", "run", script, "--", ...args];
  }
}

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
      const files = readdirSync(nodeModulesPath);
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

    if (!command) {
      throw new Error(`No command found for package manager: ${packageManager}`);
    }

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

  if (!command) {
    throw new Error(`No command found for package manager: ${packageManager}`);
  }

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