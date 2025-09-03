import type { SiteConfig } from "../../core";
import { processModel } from "../../core";
import { processManager } from "../utils/process-manager";
import { discoverSites } from "../discoverSites";
import { editingSessionManager } from "../services/editing-session-manager";
import { gitManager } from "../services/git-manager";
import { containerManager } from "../services/container-manager";
import { spawn } from "bun";
import { join } from "path";
import { existsSync } from "fs";
import { 
  ApiResponse, 
  CreateSiteRequest, 
  EditSessionRequest, 
  isDefined, 
  isNonEmptyString,
  isCreateSiteRequest
} from "../../types";

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
    const sitesWithStatus = sites.map((site: any) => {
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
    const requestData = await request.json() as unknown;
    
    if (!isCreateSiteRequest(requestData)) {
      return new Response(JSON.stringify({ error: 'Invalid request format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { name, type = 'static', force = false } = requestData;
    
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
 * Handle POST /api/sites/:name/edit/start - Start an editing session
 */
export async function handleStartEditSession(request: Request, siteName: string, context: ApiContext): Promise<Response> {
  try {
    console.log(`[DEBUG] Starting edit session for site: ${siteName}`);
    const requestData = await request.json().catch(() => ({})) as Partial<EditSessionRequest>;
    const { userId = 1 } = requestData; // Default to user ID 1 for now
    const sitePath = join(context.rootDir, siteName);
    
    console.log(`[DEBUG] Creating session with:`, {
      userId,
      siteName,
      sitePath,
      exists: existsSync(sitePath)
    });

    const session = await editingSessionManager.createSession({
      userId,
      siteName,
      sitePath
    });
    
    console.log(`[DEBUG] Session created successfully:`, {
      id: session.id,
      branchName: session.branchName,
      status: session.status
    });

    return new Response(JSON.stringify({
      success: true,
      session: {
        id: session.id,
        branchName: session.branchName,
        previewUrl: session.previewUrl,
        status: session.status
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error starting edit session:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    if (errorStack) {
      console.error('Error stack:', errorStack);
    }
    return new Response(JSON.stringify({ 
      error: 'Failed to start edit session',
      details: errorMessage 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle POST /api/sites/:name/edit/:sessionId/commit - Commit changes in an editing session
 */
export async function handleCommitEditSession(
  request: Request, 
  siteName: string, 
  sessionId: string, 
  context: ApiContext
): Promise<Response> {
  try {
    const requestData = await request.json().catch(() => ({})) as { message?: string };
    const { message } = requestData;
    const sitePath = join(context.rootDir, siteName);
    const sessionIdNum = parseInt(sessionId, 10);

    const commitHash = await editingSessionManager.commitSession(sessionIdNum, sitePath, {
      message: message || `Update ${siteName} via editor`
    });

    return new Response(JSON.stringify({
      success: true,
      commitHash
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error committing edit session:', error);
    return new Response(JSON.stringify({ error: 'Failed to commit changes' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle POST /api/sites/:name/edit/:sessionId/deploy - Deploy changes (merge to main)
 */
export async function handleDeployEditSession(
  request: Request, 
  siteName: string, 
  sessionId: string, 
  context: ApiContext
): Promise<Response> {
  try {
    const sitePath = join(context.rootDir, siteName);
    const sessionIdNum = parseInt(sessionId, 10);

    await editingSessionManager.deploySession(sessionIdNum, sitePath);

    return new Response(JSON.stringify({
      success: true
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deploying edit session:', error);
    return new Response(JSON.stringify({ error: 'Failed to deploy changes' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle DELETE /api/sites/:name/edit/:sessionId - Cancel/cleanup an editing session
 */
export async function handleCancelEditSession(
  request: Request, 
  siteName: string, 
  sessionId: string, 
  context: ApiContext
): Promise<Response> {
  try {
    const sitePath = join(context.rootDir, siteName);
    const sessionIdNum = parseInt(sessionId, 10);

    await editingSessionManager.cancelSession(sessionIdNum, sitePath);

    return new Response(JSON.stringify({
      success: true
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error canceling edit session:', error);
    return new Response(JSON.stringify({ error: 'Failed to cancel session' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle GET /api/sites/:name/edit/status - Get current editing session status
 */
export async function handleGetEditStatus(request: Request, siteName: string, context: ApiContext): Promise<Response> {
  try {
    const userId = 1; // Default to user ID 1 for now
    const session = await editingSessionManager.getActiveSession(userId, siteName);

    if (!session) {
      return new Response(JSON.stringify({
        editing: false,
        session: null
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check container status
    let containerStatus = 'building';
    if (session.containerName) {
      const isRunning = await containerManager.instance.isContainerRunning(session.containerName);
      if (isRunning) {
        containerStatus = 'running';
      } else if (session.status === 'failed') {
        containerStatus = 'error';
      }
    }

    return new Response(JSON.stringify({
      editing: true,
      session: {
        id: session.id,
        branchName: session.branchName,
        previewUrl: session.previewUrl,
        status: session.status,
        containerStatus: containerStatus,
        createdAt: session.createdAt,
        lastCommitAt: session.lastCommit
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting edit status:', error);
    return new Response(JSON.stringify({ error: 'Failed to get edit status' }), {
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
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  console.log(`[DEBUG] handleApiRequest: ${method} ${url.pathname}`);
  console.log(`[DEBUG] Path parts:`, pathParts);

  // Remove 'api' prefix
  if (pathParts[0] !== 'api') {
    console.log(`[DEBUG] Not an API request (no 'api' prefix)`);
    return null;
  }
  const apiParts = pathParts.slice(1); // Remove 'api' and get remaining parts

  // Route API requests
  const firstPart = apiParts[0];
  if (!firstPart) {
    return null;
  }
  
  if (firstPart === 'sites') {
    if (method === 'GET' && apiParts.length === 1) {
      return handleGetSites(request, context);
    }
    if (method === 'POST' && apiParts.length === 1) {
      return handleCreateSite(request, context);
    }
    if (method === 'POST' && apiParts.length === 3 && apiParts[2] === 'build') {
      const siteName = apiParts[1];
      if (!siteName) return null;
      return handleBuildSite(request, siteName, context);
    }
    if (method === 'POST' && apiParts.length === 4 && apiParts[2] === 'run') {
      const siteName = apiParts[1];
      const command = apiParts[3];
      if (!siteName || !command) return null;
      return handleRunSiteCommand(request, siteName, command, context);
    }
    
    // Git workflow endpoints
    if (apiParts.length >= 3 && apiParts[2] === 'edit') {
      const siteName = apiParts[1];
      console.log(`[DEBUG] Edit route: siteName=${siteName}, method=${method}, apiParts=`, apiParts);
      if (!siteName) {
        console.log(`[DEBUG] No site name in edit route`);
        return null;
      }
      
      // GET /api/sites/:name/edit/status
      if (method === 'GET' && apiParts.length === 4 && apiParts[3] === 'status') {
        console.log(`[DEBUG] Handling GET edit status for ${siteName}`);
        return handleGetEditStatus(request, siteName, context);
      }
      
      // POST /api/sites/:name/edit/start
      if (method === 'POST' && apiParts.length === 4 && apiParts[3] === 'start') {
        console.log(`[DEBUG] Handling POST edit start for ${siteName}`);
        return handleStartEditSession(request, siteName, context);
      }
      
      // Session-specific endpoints
      if (apiParts.length >= 5) {
        const sessionId = apiParts[3];
        const action = apiParts[4];
        if (!sessionId || !action) return null;
        
        // POST /api/sites/:name/edit/:sessionId/commit
        if (method === 'POST' && action === 'commit') {
          return handleCommitEditSession(request, siteName, sessionId, context);
        }
        
        // POST /api/sites/:name/edit/:sessionId/deploy
        if (method === 'POST' && action === 'deploy') {
          return handleDeployEditSession(request, siteName, sessionId, context);
        }
        
        // DELETE /api/sites/:name/edit/:sessionId
        if (method === 'DELETE' && apiParts.length === 4) {
          return handleCancelEditSession(request, siteName, sessionId, context);
        }
      }
    }
  }

  if (firstPart === 'processes') {
    if (method === 'GET' && apiParts.length === 1) {
      return handleGetProcesses(request);
    }
    if (method === 'POST' && apiParts.length === 3 && apiParts[2] === 'start') {
      const siteName = apiParts[1];
      if (!siteName) return null;
      return handleStartProcess(request, siteName);
    }
    if (method === 'POST' && apiParts.length === 3 && apiParts[2] === 'stop') {
      const siteName = apiParts[1];
      if (!siteName) return null;
      return handleStopProcess(request, siteName);
    }
  }

  if (firstPart === 'server') {
    const secondPart = apiParts[1];
    if (secondPart === 'status' && method === 'GET') {
      return handleGetServerStatus(request);
    }
  }

  return null; // Not handled by API
}