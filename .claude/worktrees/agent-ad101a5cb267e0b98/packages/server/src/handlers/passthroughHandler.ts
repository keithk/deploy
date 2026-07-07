import type { SiteConfig } from "@keithk/deploy-core";
import { detectPackageManager } from "@keithk/deploy-core";
import { proxyRequest } from "../utils/proxy";
import { processManager } from "../utils/process-manager";
import { debug, info, warn, error } from "../utils/logging";

// Type guard to check if a script name exists in site.commands
function hasScript(site: SiteConfig, scriptName: string): boolean {
  return !!(site.commands && site.commands[scriptName]);
}

/**
 * Creates a handler for passthrough sites.
 *
 * @param site The site configuration
 * @param mode The server mode ('serve' or 'dev')
 * @param siteIndex The index of the site in the sites array (for port calculation)
 * @returns A function that handles passthrough sites
 */
export function createPassthroughHandler(
  site: SiteConfig,
  mode: "serve" | "dev",
  siteIndex: number
) {
  // Use the configured proxyPort or calculate a default
  const proxyPort = site.proxyPort || 3000 + siteIndex + 1;

  // Check if site has commands
  if (site.commands) {
    // Get the appropriate script name based on mode
    const primaryScriptName = mode === "dev" ? "dev" : "start";
    const fallbackScriptName = mode === "dev" ? "start" : "dev";

    // Check if the site has the primary or fallback script
    const hasPrimaryScript = hasScript(site, primaryScriptName);
    const hasFallbackScript = hasScript(site, fallbackScriptName);

    // Determine which script to use
    const scriptName = hasPrimaryScript
      ? primaryScriptName
      : hasFallbackScript
      ? fallbackScriptName
      : "";

    if (scriptName) {
      // Check if a process is already running for this site
      if (!processManager.hasProcess(site.subdomain, proxyPort)) {
        info(
          `Starting ${mode} server for ${site.subdomain} on port ${proxyPort}`
        );

        // Detect the package manager for this site
        const packageManager = detectPackageManager(site.path);

        // Start the process using the process manager and the appropriate package manager
        processManager
          .startProcess(
            site.subdomain,
            proxyPort,
            scriptName, // Use the script name, not the command
            site.path,
            "passthrough",
            { PACKAGE_MANAGER: packageManager } // Pass the package manager as an env var
          )
          .catch((err) => {
            warn(`Failed to start process for ${site.subdomain}: ${err}`);
          });
      } else {
        debug(
          `Process for ${site.subdomain} is already running on port ${proxyPort}`
        );
      }
    } else {
      warn(`No ${mode} script found for passthrough site ${site.subdomain}`);
    }
  }

  // Return a proxy handler
  return async (request: Request): Promise<Response> => {
    // Check if the process is running
    const isRunning = processManager.hasProcess(site.subdomain, proxyPort);

    if (!isRunning) {
      debug(`No process running for ${site.subdomain} on port ${proxyPort}`);

      // If we're in serve mode and there's no process, try to start one
      if (
        mode === "serve" &&
        site.commands &&
        (site.commands.start || site.commands.dev)
      ) {
        // Determine which script to use
        const scriptName = hasScript(site, "start")
          ? "start"
          : hasScript(site, "dev")
          ? "dev"
          : "";

        if (!scriptName) {
          warn(`No valid script found for ${site.subdomain}`);
          return new Response(`No valid script found for ${site.subdomain}`, {
            status: 500
          });
        }

        info(
          `Starting server for ${site.subdomain} on port ${proxyPort} on demand`
        );

        // Detect the package manager for this site
        const packageManager = detectPackageManager(site.path);

        try {
          // Start the process
          await processManager.startProcess(
            site.subdomain,
            proxyPort,
            scriptName,
            site.path,
            "passthrough",
            { PACKAGE_MANAGER: packageManager } // Pass the package manager as an env var
          );

          // Give it a moment to start up
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (err) {
          error(`Failed to start process for ${site.subdomain}: ${err}`);
        }
      }
    }

    // Proxy the request to the port
    try {
      return await proxyRequest(request, proxyPort);
    } catch (err) {
      return new Response(
        `Error connecting to passthrough site ${site.subdomain}: ${err}`,
        { status: 502 }
      );
    }
  };
}
