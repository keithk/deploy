import type { SiteConfig } from "../core";
import { proxyRequest } from "../utils/proxy";
import { containerManager as containerManagerService } from "../services/container-manager";
import { debug, info, warn, error } from "../utils/logging";

// Helper to get the container manager instance
const getContainerManager = () => containerManagerService.instance;

/**
 * Creates a handler for containerized sites.
 * 
 * @param site The site configuration
 * @param mode The server mode ('serve' or 'dev')
 * @param siteIndex The index of the site in the sites array (for port calculation)
 * @returns A function that handles containerized sites
 */
export function createContainerHandler(
  site: SiteConfig,
  mode: "serve" | "dev",
  siteIndex: number
) {
  const containerName = `${site.subdomain}-production`;

  // Ensure container is created and running
  const ensureContainer = async () => {
    const isRunning = await getContainerManager().isContainerRunning(containerName);
    if (!isRunning) {
      info(`Starting container for ${site.subdomain}`);
      try {
        await getContainerManager().createContainer(site, 'production');
      } catch (err) {
        error(`Failed to start container for ${site.subdomain}: ${err}`);
        throw err;
      }
    }
  };

  // Return the request handler
  return async (request: Request): Promise<Response> => {
    try {
      const container = getContainerManager().getContainer(containerName);
      
      // If container is building, show loading page
      if (container?.status === 'building') {
        return createLoadingPage(site.subdomain, 'Building container...');
      }

      await ensureContainer();

      const updatedContainer = getContainerManager().getContainer(containerName);
      
      // Show loading page for building containers
      if (updatedContainer?.status === 'building') {
        return createLoadingPage(site.subdomain, 'Starting container...');
      }
      
      if (!updatedContainer || updatedContainer.status !== 'running') {
        if (updatedContainer?.status === 'failed') {
          return createErrorPage(site.subdomain, 'Container failed to start. Check logs for details.');
        }
        return createLoadingPage(site.subdomain, 'Preparing container...');
      }

      // Proxy the request to the container
      return await proxyRequest(request, updatedContainer.port);

    } catch (err) {
      error(`Container handler error for ${site.subdomain}: ${err}`);
      return createErrorPage(site.subdomain, `Container error: ${err}`);
    }
  };
}

/**
 * Creates a preview container handler for editor use
 */
export function createPreviewContainerHandler(
  site: SiteConfig,
  mode: "serve" | "dev",
  siteIndex: number
) {
  const containerName = `${site.subdomain}-preview`;

  return async (request: Request): Promise<Response> => {
    try {
      // Always ensure preview container is running for editor
      const isRunning = await getContainerManager().isContainerRunning(containerName);
      if (!isRunning) {
        info(`Starting preview container for ${site.subdomain}`);
        await getContainerManager().createContainer(site, 'preview');
      }

      const container = getContainerManager().getContainer(containerName);
      if (!container || container.status !== 'running') {
        return new Response(
          `Preview container ${site.subdomain} is not running`,
          { status: 503 }
        );
      }

      // Add preview-specific headers
      const response = await proxyRequest(request, container.port);
      
      // Add CORS headers for iframe communication
      const headers = new Headers(response.headers);
      headers.set('X-Frame-Options', 'ALLOWALL');
      headers.set('Access-Control-Allow-Origin', '*');
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });

    } catch (err) {
      error(`Preview container handler error for ${site.subdomain}: ${err}`);
      return new Response(
        `Preview container error for ${site.subdomain}: ${err}`,
        { status: 502 }
      );
    }
  };
}

/**
 * Creates a loading page for when containers are starting
 */
function createLoadingPage(subdomain: string, message: string): Response {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Starting ${subdomain}...</title>
  <style>
    body {
      font-family: 'MonaspaceNeon', 'Fira Code', monospace;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #f8f9fa;
      margin: 0;
      padding: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      max-width: 600px;
      padding: 2rem;
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 1rem;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    p {
      font-size: 1.2rem;
      margin-bottom: 2rem;
      opacity: 0.9;
    }
    .spinner {
      border: 4px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top: 4px solid #ffffff;
      width: 60px;
      height: 60px;
      animation: spin 1s linear infinite;
      margin: 0 auto 2rem;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .progress {
      background: rgba(255,255,255,0.2);
      height: 4px;
      border-radius: 2px;
      overflow: hidden;
      margin: 2rem 0;
    }
    .progress-bar {
      background: linear-gradient(90deg, #00d4ff, #090979);
      height: 100%;
      border-radius: 2px;
      animation: loading 2s ease-in-out infinite;
    }
    @keyframes loading {
      0% { width: 0%; }
      50% { width: 70%; }
      100% { width: 100%; }
    }
  </style>
  <script>
    // Auto-refresh every 3 seconds to check if container is ready
    setTimeout(() => {
      window.location.reload();
    }, 3000);
  </script>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>🚀 Starting ${subdomain}</h1>
    <p>${message}</p>
    <div class="progress">
      <div class="progress-bar"></div>
    </div>
    <p><small>This may take a moment while we set up your container...</small></p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
    status: 202 // Accepted - processing
  });
}

/**
 * Creates an error page for when containers fail
 */
function createErrorPage(subdomain: string, error: string): Response {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - ${subdomain}</title>
  <style>
    body {
      font-family: 'MonaspaceNeon', 'Fira Code', monospace;
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
      color: #f8f9fa;
      margin: 0;
      padding: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      max-width: 600px;
      padding: 2rem;
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 1rem;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    p {
      font-size: 1.1rem;
      margin-bottom: 2rem;
      opacity: 0.9;
    }
    .error-box {
      background: rgba(0,0,0,0.3);
      padding: 1rem;
      border-radius: 8px;
      border-left: 4px solid #fff;
      text-align: left;
      font-family: monospace;
      margin: 2rem 0;
    }
    button {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: #f8f9fa;
      padding: 0.75rem 2rem;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.3s ease;
    }
    button:hover {
      background: rgba(255,255,255,0.3);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚨 Container Error</h1>
    <p>There was a problem starting the container for <strong>${subdomain}</strong></p>
    <div class="error-box">
      ${error}
    </div>
    <button onclick="window.location.reload()">🔄 Try Again</button>
    <p><small>If this persists, check the server logs for more details.</small></p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
    status: 502 // Bad Gateway
  });
}