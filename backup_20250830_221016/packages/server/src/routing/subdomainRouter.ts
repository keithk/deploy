import type { SiteConfig } from "@keithk/deploy-core";
import { ActionRegistry } from "../actions/registry";
import { join } from "path";
import { existsSync } from "fs";
import { proxyRequest } from "../utils/proxy";

// Type definition for the routing configuration
export interface RoutingConfig {
  sites: SiteConfig[];
  mode: "serve" | "dev";
  PROJECT_DOMAIN: string;
  webhookPath: string;
  rootDir: string;
  actionRegistry: ActionRegistry;
  rootConfig: any;
}

/**
 * Sets up routing for all sites based on subdomains and routes.
 * Webhook handling is now done in createServer.ts using the webhook middleware.
 *
 * @param request The incoming request
 * @param context A Map to store request-specific data
 * @param config The routing configuration
 * @returns A Response object
 */
export async function setupSubdomainRouting(
  request: Request,
  context: Map<string, any>,
  config: RoutingConfig
): Promise<Response> {
  const { sites, mode } = config;

  // Get the site from the context (set by siteContext middleware)
  const site = context.get("site") as SiteConfig;

  console.log(`🚀 Router debug:`);
  console.log(`  - Site from context: ${site ? `${site.subdomain} (${site.type})` : 'NONE'}`);

  if (!site) {
    console.log(`  - ❌ No site in context, returning 404`);
    return new Response("Site not found", { status: 404 });
  }

  // Handle the site request
  console.log(`  - 🎯 Handling request for site: ${site.subdomain} (${site.type})`);
  return handleSiteRequest(request, site, sites.indexOf(site), mode);
}

/**
 * Handles a request for a specific site.
 *
 * @param request The incoming request
 * @param site The site configuration
 * @param siteIndex The index of the site in the sites array
 * @param mode The server mode ('serve' or 'dev')
 * @returns A Response object
 */
async function handleSiteRequest(
  request: Request,
  site: SiteConfig,
  siteIndex: number,
  mode: "serve" | "dev"
): Promise<Response> {
  console.log(`📝 handleSiteRequest debug:`);
  console.log(`  - Site: ${site.subdomain} (${site.type})`);
  console.log(`  - Site index: ${siteIndex}`);
  console.log(`  - Mode: ${mode}`);
  console.log(`  - useContainers: ${site.useContainers}`);

  // Check for Bluesky atproto DID request
  const url = new URL(request.url);

  if (url.pathname === "/.well-known/atproto-did" && site.bskyDid) {
    return new Response(site.bskyDid, {
      headers: { "Content-Type": "text/plain" }
    });
  }

  // Handle based on site type
  console.log(`  - 🔀 Routing to ${site.type} handler...`);
  if (site.type === "static") {
    // Serve static files using Bun's built-in file serving
    const filePath = join(site.path, new URL(request.url).pathname);
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
  } else if (site.type === "static-build") {
    // Serve static build files
    const buildPath = join(site.path, site.buildDir || "dist");
    const filePath = join(buildPath, new URL(request.url).pathname);
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
  } else if (site.type === "passthrough") {
    // Check if site should use containers
    console.log(`🔍 Passthrough site debug:`);
    console.log(`  - useContainers: ${site.useContainers} (type: ${typeof site.useContainers})`);
    console.log(`  - site config:`, JSON.stringify(site, null, 2));
    
    if (site.useContainers !== false) { // Default to containers unless explicitly disabled
      const { createContainerHandler } = await import(
        "../handlers/containerHandler"
      );
      const handler = createContainerHandler(site, mode, siteIndex);
      return handler(request);
    } else {
      // Legacy passthrough handler
      const { createPassthroughHandler } = await import(
        "../handlers/passthroughHandler"
      );
      const handler = createPassthroughHandler(site, mode, siteIndex);
      return handler(request);
    }
  } else if (site.type === "dynamic") {
    // Check if site should use containers
    if (site.useContainers === true) {
      const { createContainerHandler } = await import(
        "../handlers/containerHandler"
      );
      const handler = createContainerHandler(site, mode, siteIndex);
      return handler(request);
    } else {
      try {
        // Load and execute the dynamic site handler directly
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

        if (typeof siteModule.handleRequest === "function") {
          // New Bun.serve style handler
          return siteModule.handleRequest(request);
        } else if (typeof siteModule.setup === "function") {
          // Legacy Hono style handler - provide compatibility
          return new Response(
            `Dynamic site ${site.subdomain} needs to be updated to use Bun.serve`,
            { status: 500 }
          );
        } else {
          return new Response(
            `Dynamic site ${site.subdomain} does not export handleRequest function`,
            { status: 500 }
          );
        }
      } catch (err) {
        console.error(`Error handling dynamic site ${site.subdomain}:`, err);
        return new Response(
          `Error loading dynamic site: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { status: 500 }
        );
      }
    }
  } else if (site.type === "docker") {
    // Docker sites always use containers
    const { createContainerHandler } = await import(
      "../handlers/containerHandler"
    );
    const handler = createContainerHandler(site, mode, siteIndex);
    return handler(request);
  } else if (site.type === "built-in") {
    try {
      // Handle built-in sites (like admin panel)
      if (site.module && typeof site.module === 'function') {
        const module = await site.module();
        
        // Try module.fetch first, then module.default.fetch
        const fetchFn = module?.fetch || module?.default?.fetch;
        
        if (fetchFn && typeof fetchFn === 'function') {
          return fetchFn(request);
        } else {
          return new Response(
            `Built-in site ${site.subdomain} does not export fetch function`,
            { status: 500 }
          );
        }
      } else {
        return new Response(
          `Built-in site ${site.subdomain} does not have module function`,
          { status: 500 }
        );
      }
    } catch (err) {
      console.error(`Error handling built-in site ${site.subdomain}:`, err);
      return new Response(
        `Error loading built-in site: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { status: 500 }
      );
    }
  } else {
    return new Response(`Unknown site type: ${site.type}`, { status: 500 });
  }
}
