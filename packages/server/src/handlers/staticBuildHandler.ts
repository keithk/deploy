import { join } from "path";
import { existsSync } from "fs";
import type { SiteConfig } from "@keithk/deploy-core";
import {
  detectPackageManager,
  getPackageManagerCommand
} from "@keithk/deploy-core";
import { proxyRequest, startDevServer } from "../utils/proxy";

/**
 * Creates a handler for static-build sites.
 *
 * @param site The site configuration
 * @param mode The server mode ('serve' or 'dev')
 * @param siteIndex The index of the site in the sites array (for port calculation)
 * @returns A function that serves static files or proxies to a dev server
 */
export function createStaticBuildHandler(
  site: SiteConfig,
  mode: "serve" | "dev",
  siteIndex: number
) {
  const buildDir = site.buildDir ?? "dist";
  const devPort = site.devPort || 3000 + siteIndex + 1;
  const buildDirPath = join(site.path, buildDir);

  // Start dev server if in dev mode and site has dev commands
  if (
    mode === "dev" &&
    site.commands &&
    (site.commands.dev || site.commands["dev:11ty"])
  ) {
    const devScript = site.commands.dev || site.commands["dev:11ty"] || "";
    const packageManager = detectPackageManager(site.path);

    // Start the dev server
    startDevServer(site.path, devPort, packageManager, devScript);

    // Return a proxy handler
    return async (request: Request): Promise<Response> => {
      return proxyRequest(request, devPort);
    };
  } else {
    // Return a static file handler
    return async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const filePath = join(buildDirPath, url.pathname);
      const fileObj = Bun.file(filePath);

      if (await fileObj.exists()) {
        return new Response(fileObj);
      } else {
        // Try index.html if the path is a directory
        const indexPath = join(filePath, "index.html");
        const indexFile = Bun.file(indexPath);

        if (await indexFile.exists()) {
          return new Response(indexFile);
        }

        return new Response("File not found", { status: 404 });
      }
    };
  }
}
