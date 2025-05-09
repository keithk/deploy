export * from "./proxy";
import { existsSync } from "fs";
import { join } from "path";
import { debug } from "@dialup-deploy/core";

/**
 * Load environment variables from a .env file
 * @param filePath Path to the .env file
 * @returns Object with parsed environment variables
 */
export async function loadEnvFile(
  filePath: string
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};

  if (!existsSync(filePath)) {
    debug(`No .env file found at ${filePath}`);
    return env;
  }

  try {
    const content = await Bun.file(filePath).text();
    const lines = content.split("\n");

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.trim().startsWith("#") || !line.trim()) {
        continue;
      }

      // Parse KEY=VALUE format
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";

        // Remove quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }

        env[key] = value;
      }
    }

    debug(
      `Loaded ${Object.keys(env).length} environment variables from ${filePath}`
    );
    return env;
  } catch (err) {
    debug(
      `Error loading .env file from ${filePath}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return env;
  }
}
