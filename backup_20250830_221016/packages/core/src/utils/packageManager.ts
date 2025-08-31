import { join } from "path";
import { existsSync } from "fs";

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
