import type { SiteConfig, Site } from "@keithk/deploy-core";
import { siteModel } from "@keithk/deploy-core";
import { ActionRegistry } from "../actions/registry";
import { join } from "path";
import { existsSync } from "fs";
import { proxyRequest } from "../utils/proxy";
import { checkSiteAccess } from "../middleware/auth";

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

  if (!site) {
    return new Response("Site not found", { status: 404 });
  }

  // Handle the site request
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
  // Check for Bluesky atproto DID request
  const url = new URL(request.url);

  if (url.pathname === "/.well-known/atproto-did" && site.bskyDid) {
    return new Response(site.bskyDid, {
      headers: { "Content-Type": "text/plain" }
    });
  }

  // Handle based on site type
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
    // Use the passthrough handler
    const { createPassthroughHandler } = await import(
      "../handlers/passthroughHandler"
    );
    const handler = createPassthroughHandler(site, mode, siteIndex);
    return handler(request);
  } else if (site.type === "dynamic") {
    try {
      // Load and execute the dynamic site handler
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
  } else {
    return new Response(`Unknown site type: ${site.type}`, { status: 500 });
  }
}

/**
 * Extract subdomain from the host header for database-backed routing.
 */
function extractSubdomain(host: string, projectDomain: string): string | null {
  const hostNoPort = host.split(":")[0] || "";

  if (hostNoPort === projectDomain || hostNoPort === "localhost") {
    return null; // Root domain, no subdomain
  }

  const hostLabels = hostNoPort.split(".");
  const domainLabels = projectDomain.split(".");

  const isDomainMatch =
    domainLabels.length <= hostLabels.length &&
    domainLabels.every(
      (label, i) =>
        label === hostLabels[hostLabels.length - domainLabels.length + i]
    );

  if (isDomainMatch) {
    const subdomainLabels = hostLabels.slice(
      0,
      hostLabels.length - domainLabels.length
    );
    return subdomainLabels.join(".");
  }

  return null;
}

/**
 * Generate an HTML status page for non-running sites.
 */
function generateStatusPage(site: Site): Response {
  const statusMessages: Record<Site["status"], { title: string; message: string }> = {
    stopped: {
      title: "Site Stopped",
      message: "This site is currently stopped. Please contact the site owner to start it.",
    },
    building: {
      title: "Site Building",
      message: "This site is currently being built. Please check back in a few minutes.",
    },
    error: {
      title: "Site Error",
      message: "This site encountered an error during deployment. Please contact the site owner.",
    },
    running: {
      title: "Site Running",
      message: "Site is running normally.",
    },
  };

  const { title, message } = statusMessages[site.status];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${site.name}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
      color: #333;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      max-width: 500px;
    }
    h1 { margin-bottom: 16px; color: #666; }
    p { color: #888; line-height: 1.6; }
    .status {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 20px;
    }
    .status-stopped { background: #fef3c7; color: #92400e; }
    .status-building { background: #dbeafe; color: #1e40af; }
    .status-error { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <div class="container">
    <span class="status status-${site.status}">${site.status}</span>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Handle requests using database-backed site lookup.
 * This is the main entry point for subdomain routing with containerized sites.
 */
export async function handleSubdomainRequest(
  request: Request,
  projectDomain: string
): Promise<Response> {
  const host = request.headers.get("host") || "";
  const subdomain = extractSubdomain(host, projectDomain);

  if (!subdomain) {
    return new Response("Site not found", { status: 404 });
  }

  // Look up site in database by name (subdomain)
  const site = siteModel.findByName(subdomain);
  if (!site) {
    return new Response("Site not found", { status: 404 });
  }

  // Check access for private sites
  if (!checkSiteAccess(request, subdomain)) {
    return new Response("Access denied", { status: 403 });
  }

  // Handle based on site status
  if (site.status === "running" && site.port) {
    // Proxy to the running container
    return proxyRequest(request, site.port);
  }

  // Show status page for non-running sites
  return generateStatusPage(site);
}
