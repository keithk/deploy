import type { SiteConfig } from "@keithk/deploy-core";
import { discoverSites } from "./discoverSites";
import {
  logger,
  errorHandler,
  siteContext,
  webhookMiddleware
} from "./middleware";
import { setupSubdomainRouting } from "./routing";
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
} = {}): Promise<Server> {
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

        // Execute route:before-handle hook
        await executeHook("route:before-handle", {
          ...actionContext,
          request
        });

        const siteContextHandler = siteContext(sites, PROJECT_DOMAIN);
        const siteOrResponse = await siteContextHandler(request, context);

        // If the site context middleware returned a Response, it means there was an error
        if (siteOrResponse instanceof Response) {
          // Complete logger middleware
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
