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
import { debug, info, setLogLevel, LogLevel } from "@keithk/deploy-core";
import { processManager } from "./utils/process-manager";
import { handleApiRequest } from "./api/handlers";
import { SSHAuthServer } from "./auth/ssh-server";
import { validateSession, createSessionCookie } from "./middleware/auth";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * Gets the admin dashboard directory path
 */
function getAdminDir(): string {
  // In development, admin is a sibling package
  // In production, it's built into the same structure
  const possiblePaths = [
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
  const adminDir = getAdminDir();

  // Map paths to files
  let filePath: string;
  if (pathname === "/" || pathname === "") {
    filePath = join(adminDir, "index.html");
  } else {
    // Remove leading slash and serve the file
    filePath = join(adminDir, pathname.slice(1));
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
    
    // Check if domain is configured in any site
    const isValidDomain = sites.some(site => {
      // Check if it matches a custom domain
      if (site.customDomain === domain) {
        return true;
      }
      
      // Check if it matches a subdomain pattern
      const projectDomain = process.env.PROJECT_DOMAIN || 'dev.flexi';
      const subdomain = site.subdomain || site.route.replace(/^\//, '');
      if (domain === `${subdomain}.${projectDomain}`) {
        return true;
      }
      
      return false;
    });
    
    if (isValidDomain) {
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

  // Load .env if present (Bun automatically loads .env, but ensure PROJECT_DOMAIN is present)
  const PROJECT_DOMAIN = process.env.PROJECT_DOMAIN || "dev.flexi";

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
    websocket: {
      message() {},
      open() {},
      close() {}
    },
    fetch: async (request) => {
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

        // Serve admin dashboard for root domain requests
        const host = request.headers.get("host") || "";
        if (isRootDomain(host, PROJECT_DOMAIN)) {
          const adminResponse = await serveAdminFile(url.pathname);
          if (adminResponse) {
            // If there's a token in the URL, validate and set a session cookie
            const token = url.searchParams.get("token");
            if (token && validateSession(token)) {
              const cookie = createSessionCookie(token);
              const headers = new Headers(adminResponse.headers);
              headers.set("Set-Cookie", cookie);
              const responseWithCookie = new Response(adminResponse.body, {
                status: adminResponse.status,
                headers
              });
              logger.logResponse(request, responseWithCookie, loggerStart);
              return responseWithCookie;
            }
            logger.logResponse(request, adminResponse, loggerStart);
            return adminResponse;
          }
        }

        // Execute route:before-handle hook
        await executeHook("route:before-handle", {
          ...actionContext,
          request
        });

        const siteContextHandler = siteContext(sites, PROJECT_DOMAIN);
        const siteOrResponse = await siteContextHandler(request, context);

        // If the site context middleware returned a Response (site not found in filesystem),
        // try database-backed containerized sites
        if (siteOrResponse instanceof Response) {
          // Try database-backed sites (containerized deployments)
          const dbResponse = await handleSubdomainRequest(request, PROJECT_DOMAIN);
          if (dbResponse.status !== 404) {
            logger.logResponse(request, dbResponse, loggerStart);
            return dbResponse;
          }
          // Complete logger middleware with original filesystem response
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

  // Start SSH auth server for dashboard access
  const sshPort = parseInt(process.env.SSH_PORT || "2222", 10);
  const dataDir = join(process.cwd(), "data");

  try {
    const sshServer = new SSHAuthServer({
      port: sshPort,
      hostKeyPath: join(dataDir, "host_key"),
      authorizedKeysPath: join(dataDir, "authorized_keys"),
      dashboardUrl: `https://${PROJECT_DOMAIN}`
    });
    await sshServer.start();
    info(`SSH auth server running on port ${sshPort}`);
  } catch (err) {
    info(`SSH auth server not started: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Execute server:after-start hook
  await executeHook("server:after-start", actionContext);

  // Set up graceful shutdown
  const handleShutdown = async () => {
    info("Shutting down server and all managed processes...");

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
