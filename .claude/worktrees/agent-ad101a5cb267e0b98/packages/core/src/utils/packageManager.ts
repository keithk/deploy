import { join } from "path";
import { existsSync } from "fs";

/**
 * Detects the package manager used in a project based on lock files.
 * @param sitePath The path to the site directory
 * @returns The detected package manager ('npm', 'yarn', 'pnpm', or 'bun')
 */
export function detectPackageManager(sitePath: string): string {
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
