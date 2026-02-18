import type { SiteConfig } from "@keithk/deploy-core";
import { discoverSites } from "./discoverSites";
import {
  logger,
  errorHandler,
  siteContext,
  webhookMiddleware
} from "./middleware";
import { setupSubdomainRouting, handleSubdomainRequest } from "./routing";
import type { Server } from "bun";
import {
  actionRegistry,
  discoverActions,
  loadRootConfig,
  actionScheduler,
  initializeActionSystem,
  executeHook,
  routeManager
} from "./actions";
import { debug, info, warn, setLogLevel, LogLevel, settingsModel, siteModel, Database } from "@keithk/deploy-core";
import { spawn } from "bun";
import { processManager } from "./utils/process-manager";
import { handleApiRequest } from "./api/handlers";
import { handleAutodeployWebhook } from "./api/autodeploy-webhook";
import { isPasswordConfigured } from "./api/auth";
import { validateSession, createSessionCookie, getSessionFromRequest } from "./middleware/auth";
import { proxyRequest, createWebSocketHandlers } from "./utils/proxy";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { renderDeployScreen } from "./pages/deploy-screen";
import { startSleepMonitor, stopSleepMonitor } from "./services/sleep-monitor";

/**
 * Gets the admin dashboard directory path
 */
function getAdminDir(): string {
  // Look for the built admin panel in dist/ directory
  const possiblePaths = [
    join(process.cwd(), "packages/admin/dist"),
    join(dirname(fileURLToPath(import.meta.url)), "../../admin/dist"),
    join(dirname(fileURLToPath(import.meta.url)), "../../../admin/dist"),
    // Fallback to non-dist paths for development
    join(process.cwd(), "packages/admin"),
    join(dirname(fileURLToPath(import.meta.url)), "../../admin"),
    join(dirname(fileURLToPath(import.meta.url)), "../../../admin"),
  ];

  for (const p of possiblePaths) {
    if (Bun.file(join(p, "index.html")).size > 0) {
      return p;
    }
  }

  // Fallback to first path
  return possiblePaths[0];
}

/**
 * Serves files from the admin dashboard
 */
async function serveAdminFile(pathname: string): Promise<Response | null> {
  const adminDir = resolve(getAdminDir());

  // Map paths to files
  let filePath: string;
  if (pathname === "/" || pathname === "") {
    filePath = join(adminDir, "index.html");
  } else {
    // Remove leading slash and serve the file
    filePath = resolve(adminDir, pathname.slice(1));
  }

  // Prevent path traversal outside the admin directory
  if (!filePath.startsWith(adminDir)) {
    return new Response("Forbidden", { status: 403 });
  }

  const file = Bun.file(filePath);

  if (await file.exists()) {
    const contentType = getContentType(filePath);
    return new Response(file, {
      headers: { "Content-Type": contentType }
    });
  }

  return null;
}

/**
 * Gets content type based on file extension
 */
function getContentType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf"
  };
  return types[ext || ""] || "application/octet-stream";
}

/**
 * Checks if a request is for the root domain (no subdomain)
 */
function isRootDomain(host: string, projectDomain: string): boolean {
  const hostNoPort = host.split(":")[0] || "";
  return hostNoPort === projectDomain || hostNoPort === "localhost";
}

/**
 * Checks if a request is for the admin subdomain
 */
function isAdminSubdomain(host: string, projectDomain: string): boolean {
  const hostNoPort = host.split(":")[0] || "";
  return hostNoPort === `admin.${projectDomain}`;
}

/**
 * Shared styles for login and setup pages, matching the admin dashboard theme.
 */
function authPageStyles(): string {
  return `
    <style>
      :root { --font-mono: "JetBrains Mono", monospace; --accent: #e91e8c; --accent-hover: #d11a7a; }
      :root, [data-theme="light"] { --bg: #ffffff; --bg-surface: #f8f8f8; --border: #e0e0e0; --text: #1a1a1a; --text-muted: #6b6b6b; }
      [data-theme="dark"] { --bg: #0a0a0a; --bg-surface: #141414; --border: #2a2a2a; --text: #f0f0f0; --text-muted: #888888; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: var(--font-mono); background: var(--bg); color: var(--text); display: flex; justify-content: center; align-items: center; min-height: 100vh; }
      .auth-container { width: 100%; max-width: 380px; padding: 24px; }
      .auth-brand { text-align: center; margin-bottom: 32px; }
      .auth-brand-name { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
      .auth-brand-accent { color: var(--accent); }
      .auth-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 24px; }
      .auth-card h2 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
      .auth-card p { font-size: 12px; color: var(--text-muted); margin-bottom: 20px; }
      label { display: block; font-size: 12px; font-weight: 500; margin-bottom: 6px; }
      input[type="password"] { width: 100%; padding: 8px 12px; font-family: var(--font-mono); font-size: 14px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text); outline: none; }
      input[type="password"]:focus { border-color: var(--accent); }
      .field { margin-bottom: 16px; }
      .btn-primary { width: 100%; padding: 10px; font-family: var(--font-mono); font-size: 13px; font-weight: 600; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer; }
      .btn-primary:hover { background: var(--accent-hover); }
      .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .error { color: #ef4444; font-size: 12px; margin-bottom: 12px; display: none; }
      .error.visible { display: block; }
    </style>`;
}

/**
 * Render the login page HTML.
 */
function renderLoginPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - Deploy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  ${authPageStyles()}
  <script>
    (function() {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const stored = localStorage.getItem('theme');
      const theme = stored === 'dark' || stored === 'light' ? stored : (prefersDark ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', theme);
    })();
  </script>
</head>
<body>
  <div class="auth-container">
    <div class="auth-brand">
      <span class="auth-brand-name">deploy<span class="auth-brand-accent">.</span></span>
    </div>
    <div class="auth-card">
      <h2>Sign in</h2>
      <p>Enter your password to access the dashboard.</p>
      <div class="error" id="error"></div>
      <form id="login-form">
        <div class="field">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" required autofocus>
        </div>
        <button type="submit" class="btn-primary" id="submit-btn">Sign in</button>
      </form>
    </div>
  </div>
  <script>
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      const err = document.getElementById('error');
      const password = document.getElementById('password').value;
      btn.disabled = true;
      btn.textContent = 'Signing in...';
      err.classList.remove('visible');
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
          credentials: 'include'
        });
        if (res.ok) {
          window.location.href = '/';
        } else {
          const data = await res.json();
          err.textContent = data.error || 'Login failed';
          err.classList.add('visible');
        }
      } catch {
        err.textContent = 'Connection error. Try again.';
        err.classList.add('visible');
      }
      btn.disabled = false;
      btn.textContent = 'Sign in';
    });
  </script>
</body>
</html>`;
}

/**
 * Render the initial setup page HTML (first-time password creation).
 */
function renderSetupPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Setup - Deploy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  ${authPageStyles()}
  <script>
    (function() {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const stored = localStorage.getItem('theme');
      const theme = stored === 'dark' || stored === 'light' ? stored : (prefersDark ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', theme);
    })();
  </script>
</head>
<body>
  <div class="auth-container">
    <div class="auth-brand">
      <span class="auth-brand-name">deploy<span class="auth-brand-accent">.</span></span>
    </div>
    <div class="auth-card">
      <h2>Welcome to Deploy</h2>
      <p>Create a password to secure your dashboard.</p>
      <div class="error" id="error"></div>
      <form id="setup-form">
        <div class="field">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" required autofocus minlength="8" placeholder="At least 8 characters">
        </div>
        <div class="field">
          <label for="confirm">Confirm password</label>
          <input type="password" id="confirm" name="confirm" required minlength="8">
        </div>
        <button type="submit" class="btn-primary" id="submit-btn">Set password</button>
      </form>
    </div>
  </div>
  <script>
    document.getElementById('setup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      const err = document.getElementById('error');
      const password = document.getElementById('password').value;
      const confirm = document.getElementById('confirm').value;
      err.classList.remove('visible');
      if (password !== confirm) {
        err.textContent = 'Passwords do not match.';
        err.classList.add('visible');
        return;
      }
      if (password.length < 8) {
        err.textContent = 'Password must be at least 8 characters.';
        err.classList.add('visible');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Setting up...';
      try {
        const res = await fetch('/api/auth/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
          credentials: 'include'
        });
        if (res.ok) {
          window.location.href = '/';
        } else {
          const data = await res.json();
          err.textContent = data.error || 'Setup failed';
          err.classList.add('visible');
        }
      } catch {
        err.textContent = 'Connection error. Try again.';
        err.classList.add('visible');
      }
      btn.disabled = false;
      btn.textContent = 'Set password';
    });
  </script>
</body>
</html>`;
}

/**
 * Handles domain validation for on-demand TLS
 * This endpoint is called by Caddy to validate whether a domain should receive a certificate
 */
async function handleDomainValidation(request: Request, sites: SiteConfig[]): Promise<Response> {
  try {
    const url = new URL(request.url);
    const domain = url.searchParams.get('domain');
    
    if (!domain) {
      return new Response('Domain parameter required', { status: 400 });
    }
    
    debug(`Validating domain for on-demand TLS: ${domain}`);
    
    const projectDomain = process.env.PROJECT_DOMAIN || 'dev.flexi';

    // Always allow admin subdomain
    if (domain === `admin.${projectDomain}`) {
      info(`Domain validation approved: ${domain} (admin)`);
      return new Response('Domain validated', { status: 200 });
    }

    // Check if domain is configured in any filesystem site
    const isFilesystemSite = sites.some(site => {
      // Check if it matches a custom domain
      if (site.customDomain === domain) {
        return true;
      }

      // Check if it matches a subdomain pattern
      const subdomain = site.subdomain || site.route.replace(/^\//, '');
      if (domain === `${subdomain}.${projectDomain}`) {
        return true;
      }

      return false;
    });

    // Also check database-backed sites
    const dbSites = siteModel.findAll();
    const isDbSite = dbSites.some(site => {
      return domain === `${site.name}.${projectDomain}`;
    });

    if (isFilesystemSite || isDbSite) {
      info(`Domain validation approved: ${domain}`);
      return new Response('Domain validated', { status: 200 });
    } else {
      info(`Domain validation rejected: ${domain}`);
      return new Response('Domain not configured', { status: 403 });
    }
  } catch (error) {
    debug(`Domain validation error: ${error}`);
    return new Response('Validation error', { status: 500 });
  }
}

/**
 * Creates and starts the main server, mounting all detected sites.
 * Returns the running Bun server instance.
 */
export async function createServer({
  mode = "serve",
  rootDir,
  port = parseInt(process.env.PORT || "3000", 10),
  logLevel = process.env.LOG_LEVEL
    ? (parseInt(process.env.LOG_LEVEL) as LogLevel)
    : LogLevel.WARN
}: {
  mode?: "serve" | "dev";
  rootDir?: string;
  port?: number;
  logLevel?: LogLevel;
} = {}): Promise<Server<unknown>> {
  setLogLevel(logLevel);
  // Ensure rootDir is always set and absolute
  const resolvedRootDir = rootDir
    ? require("path").isAbsolute(rootDir)
      ? rootDir
      : require("path").resolve(process.cwd(), rootDir)
    : process.env.ROOT_DIR
    ? require("path").resolve(process.env.ROOT_DIR)
    : require("path").resolve(process.cwd(), "../../../../sites");

  debug(`Using root directory: ${resolvedRootDir}`);

  // Run database migrations on startup
  const db = Database.getInstance();
  await db.runMigrations();

  const actionContext: import("@keithk/deploy-core").ActionContext = {
    rootDir: resolvedRootDir,
    mode,
    sites: [] // Will be populated after site discovery
  };

  // Execute server:before-start hook
  await executeHook("server:before-start", actionContext);

  // Discover sites
  const sites = await discoverSites(resolvedRootDir, mode);
  debug(
    "Discovered sites:",
    sites.map((s: SiteConfig) => ({
      subdomain: s.subdomain,
      route: s.route,
      path: s.path
    }))
  );

  // Update action context with sites
  actionContext.sites = sites;

  // Restart any containers that should be running
  const dbSites = siteModel.findAll();
  for (const site of dbSites) {
    if (site.status === "running" && site.container_id) {
      try {
        // Check if container is actually running
        const checkProc = spawn(["docker", "inspect", "-f", "{{.State.Running}}", `deploy-${site.name}`], {
          stdout: "pipe",
          stderr: "pipe"
        });
        await checkProc.exited;
        const output = await new Response(checkProc.stdout).text();

        if (output.trim() !== "true") {
          info(`Restarting container for ${site.name}...`);
          const startProc = spawn(["docker", "start", `deploy-${site.name}`], {
            stdout: "pipe",
            stderr: "pipe"
          });
          await startProc.exited;
          if (startProc.exitCode === 0) {
            info(`Container deploy-${site.name} restarted successfully`);
          } else {
            warn(`Failed to restart container deploy-${site.name}`);
          }
        }
      } catch (err) {
        warn(`Error checking/restarting container for ${site.name}: ${err}`);
      }
    }
  }

  // Load domain from database first, then fall back to env var
  const PROJECT_DOMAIN = settingsModel.get("domain") || process.env.PROJECT_DOMAIN || "dev.flexi";

  // Load root configuration
  const rootConfig = await loadRootConfig();

  // Initialize action system
  initializeActionSystem(rootConfig);

  // Discover and register site-specific actions
  const actions = await discoverActions(resolvedRootDir, sites);
  actions.forEach((action) => actionRegistry.register(action));

  // Set up action scheduler for scheduled actions
  const scheduledActions = actionRegistry.getByType("scheduled");
  for (const action of scheduledActions) {
    if (action.config?.schedule) {
      actionScheduler.scheduleAction(
        action,
        action.config.schedule,
        actionContext
      );
    }
  }

  // Get the webhook path from config
  const webhookPath = rootConfig.actions?.webhookPath || "/webhook";

  // Prepare routing configuration
  const routingConfig = {
    sites,
    mode,
    PROJECT_DOMAIN,
    webhookPath,
    rootDir: resolvedRootDir,
    actionRegistry,
    rootConfig
  };

  // Start the server with Bun.serve
  const server = Bun.serve({
    port,
    // Add websocket property to satisfy TypeScript
    websocket: createWebSocketHandlers(),
    fetch: async (request, server) => {
      const context = new Map();

      // Apply logger middleware
      const loggerStart = logger.logRequest(request);

      try {
        // Check if this is an action route
        const actionResponse = await routeManager.handleRequest(
          request,
          actionContext
        );
        if (actionResponse) {
          // Complete logger middleware
          logger.logResponse(request, actionResponse, loggerStart);
          return actionResponse;
        }

        // Check for API endpoints
        const url = new URL(request.url);
        
        // Handle domain validation for on-demand TLS
        if (url.pathname === '/api/validate-domain') {
          const response = await handleDomainValidation(request, sites);
          logger.logResponse(request, response, loggerStart);
          return response;
        }
        
        // Handle health check endpoint
        if (url.pathname === '/health') {
          const response = new Response('OK', { status: 200 });
          logger.logResponse(request, response, loggerStart);
          return response;
        }
        
        // Handle API requests
        if (url.pathname.startsWith('/api/')) {
          const apiContext = {
            sites,
            rootDir: resolvedRootDir,
            mode
          };
          const apiResponse = await handleApiRequest(request, apiContext);
          if (apiResponse) {
            logger.logResponse(request, apiResponse, loggerStart);
            return apiResponse;
          }
        }
        
        // Handle autodeploy webhook (per-site GitHub webhooks)
        const autodeployResponse = await handleAutodeployWebhook(request);
        if (autodeployResponse) {
          logger.logResponse(request, autodeployResponse, loggerStart);
          return autodeployResponse;
        }

        // Check if this is a webhook request (legacy support)
        if (
          url.pathname.startsWith(webhookPath) &&
          rootConfig.actions?.enabled
        ) {
          const webhookHandler = webhookMiddleware(
            actionRegistry,
            actionContext
          );
          const response = await errorHandler.wrap(webhookHandler)(request);

          // Complete logger middleware
          logger.logResponse(request, response, loggerStart);
          return response;
        }

        const host = request.headers.get("host") || "";

        // Serve admin dashboard for admin subdomain
        if (isAdminSubdomain(host, PROJECT_DOMAIN)) {
          // Check authentication before serving the dashboard
          const sessionToken = getSessionFromRequest(request);
          const isAuthenticated = validateSession(sessionToken);

          if (!isAuthenticated) {
            // Unauthenticated: serve login or setup page
            if (!isPasswordConfigured()) {
              const response = new Response(renderSetupPage(), {
                headers: { "Content-Type": "text/html; charset=utf-8" }
              });
              logger.logResponse(request, response, loggerStart);
              return response;
            }
            const response = new Response(renderLoginPage(), {
              headers: { "Content-Type": "text/html; charset=utf-8" }
            });
            logger.logResponse(request, response, loggerStart);
            return response;
          }

          // Serve deploy screen preview at /deploy-screen
          if (url.pathname === '/deploy-screen') {
            const response = new Response(renderDeployScreen('my-app', 'deploying...'), {
              headers: { "Content-Type": "text/html; charset=utf-8" }
            });
            logger.logResponse(request, response, loggerStart);
            return response;
          }

          // Authenticated: serve the SPA
          let adminResponse = await serveAdminFile(url.pathname);

          // SPA fallback: if file not found, serve index.html for client-side routing
          if (!adminResponse && !url.pathname.includes('.')) {
            adminResponse = await serveAdminFile('/');
          }

          if (adminResponse) {
            logger.logResponse(request, adminResponse, loggerStart);
            return adminResponse;
          }
        }

        // For root domain, check for primary site setting
        if (isRootDomain(host, PROJECT_DOMAIN)) {
          const primarySiteId = settingsModel.get("primary_site");
          if (primarySiteId) {
            const primarySite = siteModel.findById(primarySiteId);
            // Proxy to primary site if it has a valid port and is running or building
            // (during blue-green deployment, old container keeps serving while building)
            if (primarySite && primarySite.port &&
                (primarySite.status === "running" || primarySite.status === "building")) {
              // Proxy to the primary site's container
              const response = await proxyRequest(request, primarySite.port, server);
              logger.logResponse(request, response, loggerStart);
              return response;
            }
          }

          // No primary site set - show a simple page directing to admin
          const noPrimarySiteHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>No Primary Site</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-bottom: 16px; }
    p { color: #666; margin-bottom: 24px; }
    a { color: #0066cc; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>No Primary Site Set</h1>
    <p>Configure a primary site in the admin panel to serve it here.</p>
    <a href="https://admin.${PROJECT_DOMAIN}/settings">Go to Admin Settings</a>
  </div>
</body>
</html>`;
          const response = new Response(noPrimarySiteHtml, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" }
          });
          logger.logResponse(request, response, loggerStart);
          return response;
        }

        // Execute route:before-handle hook
        await executeHook("route:before-handle", {
          ...actionContext,
          request
        });

        // Try database-backed containerized sites FIRST
        // This gives containerized deployments priority over filesystem sites
        const dbResponse = await handleSubdomainRequest(server, request, PROJECT_DOMAIN);
        if (dbResponse.status !== 404) {
          logger.logResponse(request, dbResponse, loggerStart);
          return dbResponse;
        }

        // Fall back to filesystem-based sites
        const siteContextHandler = siteContext(sites, PROJECT_DOMAIN);
        const siteOrResponse = await siteContextHandler(request, context);

        // If the site context middleware returned a Response (site not found),
        // return the 404
        if (siteOrResponse instanceof Response) {
          logger.logResponse(request, siteOrResponse, loggerStart);
          return siteOrResponse;
        }

        // Handle the request using our routing system with error handling
        const routingHandler = async (req: Request) =>
          setupSubdomainRouting(req, context, routingConfig);

        const response = await errorHandler.wrap(routingHandler)(request);

        // Execute route:after-handle hook
        await executeHook("route:after-handle", {
          ...actionContext,
          request,
          response
        });

        // Complete logger middleware
        logger.logResponse(request, response, loggerStart);

        return response;
      } catch (error) {
        const errorResponse = new Response(
          JSON.stringify({
            error: "Internal Server Error",
            message: error instanceof Error ? error.message : String(error)
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );

        // Complete logger middleware
        logger.logResponse(request, errorResponse, loggerStart);
        return errorResponse;
      }
    }
  });

  info(
    `Server running at http://localhost:${server.port} in ${mode} mode, domain: ${PROJECT_DOMAIN}`
  );

  // Execute server:after-start hook
  await executeHook("server:after-start", actionContext);

  // Start sleep monitor for idle site detection
  startSleepMonitor();

  // Set up graceful shutdown
  const handleShutdown = async () => {
    info("Shutting down server and all managed processes...");

    // Stop the sleep monitor
    stopSleepMonitor();

    // Execute server:before-stop hook
    await executeHook("server:before-stop", actionContext);

    // Shutdown all managed processes
    await processManager.shutdownAll();

    // Exit the process
    process.exit(0);
  };

  // Register shutdown handlers
  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
  process.on("SIGHUP", handleShutdown);

  return server;
}
