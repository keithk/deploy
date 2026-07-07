// ABOUTME: Action discovery for deployed containerized sites.
// ABOUTME: Scans .deploy/actions/ directory and extracts action metadata.

import { join } from "path";
import { existsSync, readdirSync } from "fs";
import { debug, info, error } from "@keithk/deploy-core";

export interface DiscoveredAction {
  id: string;
  name?: string;
  type: string;
  entryPath: string;
}

/**
 * Discover actions from a deployed site's source directory.
 * Scans .deploy/actions/ for TypeScript/JavaScript files that export action definitions.
 *
 * @param sitePath Path to the site's cloned repository
 * @param siteId The site's database ID
 * @returns Array of discovered actions with metadata
 */
export async function discoverSiteActions(
  sitePath: string,
  siteId: string
): Promise<DiscoveredAction[]> {
  const actions: DiscoveredAction[] = [];
  const actionsDir = join(sitePath, ".deploy", "actions");

  if (!existsSync(actionsDir)) {
    debug(`No actions directory found at ${actionsDir}`);
    return actions;
  }

  try {
    const files = readdirSync(actionsDir)
      .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

    debug(`Found ${files.length} potential action files in ${actionsDir}`);

    for (const file of files) {
      const filePath = join(actionsDir, file);

      try {
        // Import the file to get action metadata
        const module = await import(filePath);

        if (
          module.default &&
          typeof module.default === "object" &&
          module.default.id
        ) {
          const actionDef = module.default;

          actions.push({
            id: actionDef.id,
            name: actionDef.name || actionDef.id,
            type: actionDef.type || "custom",
            entryPath: filePath
          });

          debug(`Discovered action: ${actionDef.id} from ${file}`);
        }
      } catch (err) {
        // Log but don't fail - action might have import errors
        error(`Failed to load action from ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    error(`Error reading actions directory ${actionsDir}: ${err instanceof Error ? err.message : String(err)}`);
  }

  info(`Discovered ${actions.length} actions for site`);
  return actions;
}
