import { debug, info, warn } from "./logging";
import { processManager } from "./process-manager";

/**
 * Proxies a request to a local development server.
 *
 * @param request The original request
 * @param targetPort The port of the target development server
 * @returns A Response object
 */
export async function proxyRequest(
  request: Request,
  targetPort: number
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const targetUrl = `http://localhost:${targetPort}${pathname}${url.search}`;

  debug(`Proxying request to: ${targetUrl}`);

  try {
    // Create a new headers object to ensure we're not modifying the original
    const headers = new Headers(request.headers);

    // Set headers that dev servers might need
    headers.set("Host", `localhost:${targetPort}`);

    // Create the proxy request with the modified headers
    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: headers,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.clone().body
          : undefined
    });

    const response = await fetch(proxyReq);

    // Create a new headers object for the response
    const responseHeaders = new Headers(response.headers);

    // Ensure CORS headers are set correctly
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (err) {
    return new Response(
      `Error connecting to server: ` +
        (err instanceof Error ? err.message : String(err)),
      { status: 502 }
    );
  }
}

/**
 * Starts a development server for a static-build site.
 *
 * @param sitePath The path to the site directory
 * @param port The port to start the dev server on
 * @param packageManager The package manager to use (npm, yarn, pnpm, bun)
 * @param devScript The dev script name to run
 * @param siteSubdomain The site subdomain for process identification
 * @returns Promise<boolean> indicating success
 */
export async function startDevServer(
  sitePath: string,
  port: number,
  packageManager: string,
  devScript: string,
  siteSubdomain?: string
): Promise<boolean> {
  const siteName = siteSubdomain || require("path").basename(sitePath);
  
  // Check if a process is already running for this site
  if (processManager.hasProcess(siteName, port)) {
    debug(`Dev server for ${siteName} is already running on port ${port}`);
    return true;
  }

  info(`Starting dev server for ${siteName} on port ${port} with script: ${devScript}`);

  try {
    // Start the process using the process manager
    const success = await processManager.startProcess(
      siteName,
      port,
      devScript,
      sitePath,
      "static-build",
      { PACKAGE_MANAGER: packageManager, MODE: "dev" }
    );

    if (success) {
      info(`Successfully started dev server for ${siteName} on port ${port}`);
    } else {
      warn(`Failed to start dev server for ${siteName} on port ${port}`);
    }

    return success;
  } catch (err) {
    warn(`Error starting dev server for ${siteName}: ${err}`);
    return false;
  }
}
