import { join } from "path";
import { existsSync } from "fs";
import type { SiteConfig } from "../../core";

/**
 * Creates a handler for dynamic sites.
 *
 * @param site The site configuration
 * @returns A function that handles dynamic sites
 */
export async function createDynamicSiteHandler(
  site: SiteConfig
): Promise<(request: Request) => Promise<Response>> {
  try {
    let entryPath = site.entryPoint
      ? join(site.path, site.entryPoint + ".ts")
      : join(site.path, "index.ts");

    // Check for JS files if TS file doesn't exist
    if (
      !entryPath.endsWith(".ts") &&
      !entryPath.endsWith(".js") &&
      !entryPath.endsWith(".mjs")
    ) {
      const jsPath = entryPath.replace(/\.ts$/, ".js");
      if (existsSync(jsPath)) {
        entryPath = jsPath;
      }
    }

    const fileUrl = Bun.pathToFileURL(entryPath).href;
    const siteModule = await import(fileUrl);

    // Check if the module exports a handleRequest function (Bun.serve style)
    if (typeof siteModule.handleRequest === "function") {
      return siteModule.handleRequest;
    }
    // Check if the module exports a setup function (legacy Hono style)
    else if (typeof siteModule.setup === "function") {
      return async (request: Request): Promise<Response> => {
        return new Response(
          `Dynamic site ${
            site.subdomain || site.route
          } needs to be updated to use Bun.serve`,
          { status: 500 }
        );
      };
    }
    // Check if the module has a default export
    else if (siteModule.default) {
      return async (request: Request): Promise<Response> => {
        return new Response(
          `Dynamic site ${
            site.subdomain || site.route
          } needs to be updated to use Bun.serve`,
          { status: 500 }
        );
      };
    }
    // No valid export found
    else {
      return async (request: Request): Promise<Response> => {
        return new Response(
          `Dynamic site ${
            site.subdomain || site.route
          } does not export handleRequest function`,
          { status: 500 }
        );
      };
    }
  } catch (err) {
    // Return an error handler
    return async (request: Request): Promise<Response> => {
      return new Response(
        `Error loading dynamic site: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { status: 500 }
      );
    };
  }
}
