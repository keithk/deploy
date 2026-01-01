// ABOUTME: Main API router for development server endpoints.
// ABOUTME: Routes requests to site discovery, process management, and server status handlers.

import type { SiteConfig } from "@keithk/deploy-core";
import { processModel } from "@keithk/deploy-core";
import { processManager } from "../utils/process-manager";
import { discoverSites } from "../discoverSites";
import { spawn } from "bun";
import { join } from "path";
import { handleSitesApi } from "./sites";
import { handleSettingsApi } from "./settings";
import { handleGitHubApi } from "./github";
import { handleActionsApi } from "./actions";

interface ApiContext {
  sites: SiteConfig[];
  rootDir: string;
  mode: string;
}

/**
 * Handle GET /api/sites - Get all configured sites
 */
export async function handleGetSites(request: Request, context: ApiContext): Promise<Response> {
  try {
    // Get fresh site data
    const sites = await discoverSites(context.rootDir, context.mode as "serve" | "dev");
    
    // Enhance with process status
    const allProcesses = processModel.getAll();
    const sitesWithStatus = sites.map(site => {
      const siteProcesses = allProcesses.filter(p => p.site === site.subdomain);
      const runningProcess = siteProcesses.find((p: any) => p.status === 'running');
      
      return {
        ...site,
        name: site.subdomain, // Add name for compatibility
        status: runningProcess ? 'running' : 'stopped',
        port: runningProcess?.port,
        processId: runningProcess?.id
      };
    });

    return new Response(JSON.stringify(sitesWithStatus), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting sites:', error);
    return new Response(JSON.stringify({ error: 'Failed to get sites' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle POST /api/sites - Create a new site
 */
export async function handleCreateSite(request: Request, context: ApiContext): Promise<Response> {
  try {
    const { name, type = 'static', force = false } = await request.json();
    
    if (!name) {
      return new Response(JSON.stringify({ error: 'Site name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Use the CLI command to create the site
    const proc = spawn([
      'bun', 'run', 'deploy', 'site', 'create', name, '--type', type, ...(force ? ['--force'] : [])
    ], {
      cwd: context.rootDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    await proc.exited;

    if (proc.exitCode === 0) {
      return new Response(JSON.stringify({ success: true, name, type }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ error: 'Failed to create site' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Error creating site:', error);
    return new Response(JSON.stringify({ error: 'Failed to create site' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle GET /api/processes - Get all processes
 */
export async function handleGetProcesses(request: Request): Promise<Response> {
  try {
    const processes = processModel.getAll();
    return new Response(JSON.stringify(processes), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting processes:', error);
    return new Response(JSON.stringify({ error: 'Failed to get processes' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle POST /api/processes/:id/start - Start a process
 */
export async function handleStartProcess(request: Request, processId: string): Promise<Response> {
  try {
    const process = processModel.getById(processId);
    if (!process) {
      return new Response(JSON.stringify({ error: 'Process not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Start the process using the imported processManager
    const success = await processManager.startProcess(
      process.site,
      process.port,
      process.script,
      process.cwd,
      process.type,
      {}
    );

    if (success) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ error: 'Failed to start process' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Error starting process:', error);
    return new Response(JSON.stringify({ error: 'Failed to start process' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle POST /api/processes/:id/stop - Stop a process
 */
export async function handleStopProcess(request: Request, processId: string): Promise<Response> {
  try {
    const process = processModel.getById(processId);
    if (!process) {
      return new Response(JSON.stringify({ error: 'Process not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Stop the process using the imported processManager
    await processManager.stopProcess(process.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error stopping process:', error);
    return new Response(JSON.stringify({ error: 'Failed to stop process' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle POST /api/sites/:name/build - Build a site
 */
export async function handleBuildSite(request: Request, siteName: string, context: ApiContext): Promise<Response> {
  try {
    // Use the CLI command to build the site
    const proc = spawn([
      'bun', 'run', 'deploy', 'build', siteName
    ], {
      cwd: context.rootDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    await proc.exited;

    if (proc.exitCode === 0) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      const stderr = await new Response(proc.stderr).text();
      return new Response(JSON.stringify({ error: 'Build failed', details: stderr }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Error building site:', error);
    return new Response(JSON.stringify({ error: 'Failed to build site' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle POST /api/sites/:name/run/:command - Run a command for a site
 */
export async function handleRunSiteCommand(
  request: Request, 
  siteName: string, 
  command: string, 
  context: ApiContext
): Promise<Response> {
  try {
    // Use the CLI command to run the site command
    const proc = spawn([
      'bun', 'run', 'deploy', 'run', siteName, command
    ], {
      cwd: context.rootDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    await proc.exited;

    if (proc.exitCode === 0) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      const stderr = await new Response(proc.stderr).text();
      return new Response(JSON.stringify({ error: 'Command failed', details: stderr }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Error running site command:', error);
    return new Response(JSON.stringify({ error: 'Failed to run command' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle GET /api/server/status - Get server status
 */
export async function handleGetServerStatus(request: Request): Promise<Response> {
  try {
    return new Response(JSON.stringify({
      status: 'running',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting server status:', error);
    return new Response(JSON.stringify({ error: 'Failed to get server status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Main API router
 */
export async function handleApiRequest(request: Request, context: ApiContext): Promise<Response | null> {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;
  const pathParts = path.split('/').filter(Boolean);

  // Remove 'api' prefix
  if (pathParts[0] !== 'api') {
    return null;
  }
  const apiParts = pathParts.slice(1); // Remove 'api' and get remaining parts
  const firstPart = apiParts[0];

  // Route to settings API
  if (firstPart === 'settings') {
    return handleSettingsApi(request);
  }

  // Route to GitHub API
  if (firstPart === 'github') {
    return handleGitHubApi(request, path);
  }

  // Route to actions API
  if (firstPart === 'actions') {
    return handleActionsApi(request, path);
  }

  // Route to sites API for database-backed operations
  if (firstPart === 'sites') {
    // Try database-backed sites API first
    const sitesApiResponse = await handleSitesApi(request, path);
    if (sitesApiResponse) {
      return sitesApiResponse;
    }

    // Fall back to filesystem-based site discovery handlers
    if (method === 'GET' && apiParts.length === 1) {
      return handleGetSites(request, context);
    }
    if (method === 'POST' && apiParts.length === 1) {
      return handleCreateSite(request, context);
    }
    if (method === 'POST' && apiParts.length === 3 && apiParts[2] === 'build') {
      return handleBuildSite(request, apiParts[1], context);
    }
    if (method === 'POST' && apiParts.length === 4 && apiParts[2] === 'run') {
      return handleRunSiteCommand(request, apiParts[1], apiParts[3], context);
    }
  }

  if (firstPart === 'processes') {
    if (method === 'GET' && apiParts.length === 1) {
      return handleGetProcesses(request);
    }
    if (method === 'POST' && apiParts.length === 3 && apiParts[2] === 'start') {
      return handleStartProcess(request, apiParts[1]);
    }
    if (method === 'POST' && apiParts.length === 3 && apiParts[2] === 'stop') {
      return handleStopProcess(request, apiParts[1]);
    }
  }

  if (firstPart === 'server' && apiParts[1] === 'status') {
    if (method === 'GET') {
      return handleGetServerStatus(request);
    }
  }

  return null; // Not handled by API
}