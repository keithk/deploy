import { Hono } from 'hono';
import { join, resolve, relative, dirname } from 'path';
import { readdir, readFile, writeFile, mkdir, unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { Database } from '../../core/database/database';
import { requireAuth } from './auth';
import { sanitizePath, isEditableFile, getFileLanguage } from '../utils/site-helpers';
import type { HonoContext, SiteData } from '../../types/hono';
import { containerManager } from '../../server/services/container-manager';

/**
 * Helper to detect if a project has file watching capability
 */
async function detectFileWatching(sitePath: string): Promise<boolean> {
  try {
    const { existsSync, readFileSync } = await import('fs');
    const { join } = await import('path');
    
    const packageJsonPath = join(sitePath, 'package.json');
    if (!existsSync(packageJsonPath)) {
      return false;
    }
    
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    
    // Check for dev script (most common indicator)
    if (packageJson.scripts?.dev) {
      return true;
    }
    
    // Check for file watching frameworks/tools
    const watchingDependencies = ['vite', 'next', 'nuxt', 'webpack-dev-server', 'nodemon'];
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    return watchingDependencies.some(dep => allDeps[dep]);
  } catch (err) {
    return false;
  }
}
import { editingSessionManager } from '../../server/services/editing-session-manager';
import { gitService } from '../../server/services/git-service';

const fileRoutes = new Hono();

// Apply authentication to all file routes
fileRoutes.use('*', requireAuth);

/**
 * Execute a command inside a Docker container
 */
async function execInContainer(containerName: string, command: string, workingDir: string = '/app'): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const dockerProcess = spawn('docker', ['exec', '-w', workingDir, containerName, 'sh', '-c', command], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    dockerProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    
    dockerProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    dockerProcess.on('close', (exitCode: number | null) => {
      resolve({ stdout, stderr, exitCode: exitCode || 0 });
    });
    
    dockerProcess.on('error', (err: Error) => {
      reject(new Error(`Docker exec failed: ${err.message}`));
    });
  });
}

/**
 * Read file content from container or host filesystem
 */
async function readFileFromSource(filePath: string, containerName?: string): Promise<string> {
  if (containerName) {
    // Read from container
    const { stdout, stderr, exitCode } = await execInContainer(
      containerName, 
      `cat "${filePath.replace(/"/g, '\\"')}"`,
      '/app'
    );
    
    if (exitCode !== 0) {
      throw new Error(`Failed to read file from container: ${stderr}`);
    }
    
    return stdout;
  } else {
    // Read from host filesystem
    return await readFile(filePath, 'utf-8');
  }
}

/**
 * Write file content to container or host filesystem
 */
async function writeFileToSource(filePath: string, content: string, containerName?: string): Promise<void> {
  if (containerName) {
    // Write to container - use base64 encoding to handle special characters
    const encodedContent = Buffer.from(content).toString('base64');
    const { stderr, exitCode } = await execInContainer(
      containerName,
      `echo "${encodedContent}" | base64 -d > "${filePath.replace(/"/g, '\\"')}"`,
      '/app'
    );
    
    if (exitCode !== 0) {
      throw new Error(`Failed to write file to container: ${stderr}`);
    }
  } else {
    // Write to host filesystem
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(filePath, content, 'utf-8');
  }
}

/**
 * Check if user has access to a site
 */
async function checkSiteAccess(siteName: string, userId: number, isAdmin: boolean): Promise<{ hasAccess: boolean; sitePath?: string }> {
  const db = Database.getInstance();
  
  const sites = db.query<{ user_id: number; path: string }>(
    `SELECT user_id, path FROM sites WHERE name = ?`,
    [siteName]
  );
  
  if (sites.length === 0) {
    return { hasAccess: false };
  }
  
  const site = sites[0];
  if (!site) {
    return { hasAccess: false };
  }
  
  if (site.user_id !== userId && !isAdmin) {
    return { hasAccess: false };
  }
  
  const sitePath = site.path.startsWith('/')
    ? site.path
    : resolve(process.env.ROOT_DIR || './sites', siteName);
    
  return { hasAccess: true, sitePath };
}

/**
 * Build file tree recursively
 */
async function buildFileTree(dirPath: string, basePath: string, maxDepth: number = 3, currentDepth: number = 0): Promise<any[]> {
  if (currentDepth >= maxDepth) return [];
  
  const tree = [];
  
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip hidden files, .gitignore files, and node_modules
      if (entry.name.startsWith('.') || entry.name === '.gitignore' || entry.name === 'node_modules') {
        continue;
      }
      
      const fullPath = join(dirPath, entry.name);
      const relativePath = relative(basePath, fullPath);
      
      if (entry.isDirectory()) {
        const children = await buildFileTree(fullPath, basePath, maxDepth, currentDepth + 1);
        tree.push({
          name: entry.name,
          path: relativePath,
          type: 'folder',
          children
        });
      } else if (entry.isFile() && isEditableFile(entry.name)) {
        tree.push({
          name: entry.name,
          path: relativePath,
          type: 'file',
          language: getFileLanguage(entry.name)
        });
      }
    }
  } catch (error) {
    console.error('Error building file tree:', error);
  }
  
  return tree.sort((a, b) => {
    // Folders first, then files
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

// Get file tree for a site
fileRoutes.get('/sites/:sitename/tree', async (c: HonoContext) => {
  const user = c.get('user');
  const siteName = c.req.param('sitename');
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    // Check for active editing session
    const activeSession = await editingSessionManager.getActiveSession(user.id, siteName);
    
    let tree;
    if (activeSession && activeSession.containerName) {
      // Get file tree from container
      try {
        const { stdout, stderr, exitCode } = await execInContainer(
          activeSession.containerName,
          'find /app -type f -name "*" | grep -E "\.(js|ts|jsx|tsx|vue|css|scss|html|md|json|toml)$" | head -200',
          '/app'
        );
        
        if (exitCode === 0) {
          // Convert find output to file tree structure
          const files = stdout.trim().split('\n').filter(f => f.trim());
          // Build file tree from paths
          tree = await buildFileTree(sitePath, sitePath);  // TODO: Build from container paths
        } else {
          console.warn(`Container file listing failed: ${stderr}`);
          // Fallback to host filesystem
          tree = await buildFileTree(sitePath, sitePath);
        }
      } catch (containerError) {
        console.warn(`Failed to get file tree from container: ${containerError}`);
        // Fallback to host filesystem 
        tree = await buildFileTree(sitePath, sitePath);
      }
    } else {
      // Use host filesystem
      if (!existsSync(sitePath)) {
        return c.json({ success: false, error: 'Site directory not found' });
      }
      tree = await buildFileTree(sitePath, sitePath);
    }
    
    return c.json({ 
      success: true, 
      tree,
      editMode: false,  // TODO: Check for active session
      branchName: undefined
    });
    
  } catch (error) {
    console.error('Error loading file tree:', error);
    return c.json({ success: false, error: 'Failed to load file tree' });
  }
});

// Read file content
fileRoutes.get('/sites/:sitename/file/:filepath{.+}', async (c: HonoContext) => {
  const user = c.get('user');
  const siteName = c.req.param('sitename');
  const filepath = c.req.param('filepath');
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    // Sanitize and validate file path
    const cleanPath = sanitizePath(filepath);
    
    // Check if file is editable
    if (!isEditableFile(cleanPath)) {
      return c.json({ success: false, error: 'File type not editable' });
    }
    
    // Check for active editing session
    const activeSession = await editingSessionManager.getActiveSession(user.id, siteName);
    
    let content: string;
    let readSource = 'host';
    
    if (activeSession && activeSession.containerName) {
      // Read from container
      try {
        const containerPath = `/${cleanPath}`; // Container paths are relative to /app
        content = await readFileFromSource(containerPath, activeSession.containerName);
        readSource = 'container';
      } catch (containerError) {
        console.warn(`Failed to read from container: ${containerError}`);
        // Fallback to host filesystem
        const fullPath = join(sitePath, cleanPath);
        
        if (!fullPath.startsWith(sitePath)) {
          return c.json({ success: false, error: 'Invalid file path' });
        }
        
        if (!existsSync(fullPath)) {
          return c.json({ success: false, error: 'File not found' });
        }
        
        content = await readFile(fullPath, 'utf-8');
        readSource = 'host-fallback';
      }
    } else {
      // Read from host filesystem
      const fullPath = join(sitePath, cleanPath);
      
      if (!fullPath.startsWith(sitePath)) {
        return c.json({ success: false, error: 'Invalid file path' });
      }
      
      if (!existsSync(fullPath)) {
        return c.json({ success: false, error: 'File not found' });
      }
      
      const stats = await stat(fullPath);
      if (!stats.isFile()) {
        return c.json({ success: false, error: 'Not a file' });
      }
      
      content = await readFile(fullPath, 'utf-8');
    }
    
    return c.json({ 
      success: true, 
      content,
      language: getFileLanguage(cleanPath),
      readSource,
      editMode: false,  // TODO: Check for active session
      branchName: undefined
    });
    
  } catch (error) {
    console.error('Error reading file:', error);
    return c.json({ success: false, error: 'Failed to read file' });
  }
});

// Save file content
fileRoutes.put('/sites/:sitename/file/:filepath{.+}', async (c: HonoContext) => {
  const user = c.get('user');
  const siteName = c.req.param('sitename');
  const filepath = c.req.param('filepath');
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    const { content } = await c.req.json();
    
    if (typeof content !== 'string') {
      return c.json({ success: false, error: 'Invalid content' });
    }
    
    // Sanitize and validate file path
    const cleanPath = sanitizePath(filepath);
    const fullPath = join(sitePath, cleanPath);
    
    // Ensure the file is within the site directory
    if (!fullPath.startsWith(sitePath)) {
      return c.json({ success: false, error: 'Invalid file path' });
    }
    
    // Check if file is editable
    if (!isEditableFile(fullPath)) {
      return c.json({ success: false, error: 'File type not editable' });
    }
    
    // Ensure directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    
    // Check if user has active editing session
    const activeSession = await editingSessionManager.getActiveSession(user.id, siteName);
    
    let writeSource = 'host';
    let commitHash: string | null = null;
    
    if (activeSession && activeSession.containerName) {
      // Save to container and Git branch
      try {
        console.log(`Saving file ${filepath} to container ${activeSession.containerName} and Git branch ${activeSession.branchName}`);
        
        // Write file to container filesystem
        const containerPath = `/${cleanPath}`;
        await writeFileToSource(containerPath, content, activeSession.containerName);
        writeSource = 'container';
        
        // Also commit changes to Git branch in container
        const { stderr: gitAddErr } = await execInContainer(
          activeSession.containerName,
          `git add "${containerPath.replace(/"/g, '\\"')}"`
        );
        
        const { stderr: gitCommitErr } = await execInContainer(
          activeSession.containerName,
          `git config --global user.email "editor@deploy.local" && git config --global user.name "${user.username || 'Editor'}" && git commit -m "Update ${filepath}" || true`
        );
        
        console.log(`File saved to container and committed to Git branch`);
        
        // Update session activity
        await editingSessionManager.updateActivity(activeSession.id);
        
        // For Ruby containers, trigger hot reload
        try {
          // Check if this is a Ruby container by checking for puma process
          const { stdout: psOutput } = await execInContainer(
            activeSession.containerName,
            'ps aux | grep -E "puma|ruby" | grep -v grep || true'
          );
          
          if (psOutput.includes('puma')) {
            // Send USR2 signal to Puma master process for phased restart
            const { stdout: reloadOutput } = await execInContainer(
              activeSession.containerName,
              'pkill -USR2 -f "puma.*master" || pkill -USR1 -f "puma" || true'
            );
            console.log('Sent hot reload signal to Puma');
          }
        } catch (reloadErr) {
          console.log('Could not send reload signal:', reloadErr);
        }
        
      } catch (containerError) {
        console.error(`Failed to save to container: ${containerError}`);
        // Fallback to host filesystem and Git
        console.log(`Falling back to host filesystem save for ${filepath}`);
        
        await writeFile(fullPath, content, 'utf-8');
        writeSource = 'host-fallback';
        
        try {
          await gitService.checkoutBranch(sitePath, activeSession.branchName);
          commitHash = await gitService.commitChanges(sitePath, `Update ${filepath}`);
          
          if (commitHash) {
            await editingSessionManager.commitSession(activeSession.id, sitePath, {
              message: `Update ${filepath}`,
              author: user.username || 'Anonymous'
            });
          }
        } catch (gitError) {
          console.error(`Git fallback also failed: ${gitError}`);
        }
      }
    } else {
      // No active session - save to host filesystem (normal behavior)
      console.log(`No active editing session - saving ${filepath} to host filesystem`);
      await writeFile(fullPath, content, 'utf-8');
    }
    
    // Update last_edited in database
    const db = Database.getInstance();
    db.run(
      `UPDATE sites SET last_edited = CURRENT_TIMESTAMP WHERE name = ?`,
      [siteName]
    );
    
    // Determine response based on whether we had an active session
    let responseMessage = 'File saved successfully';
    let containerStatus = 'none';
    let updateType = 'none';
    let estimatedDuration = 0;
    
    if (activeSession && writeSource.startsWith('container')) {
      // File was saved to container - no need to restart, dev server should pick up changes
      const hasWatching = await detectFileWatching(sitePath);
      const isPackageChange = filepath.includes('package.json');
      
      if (hasWatching && !isPackageChange) {
        responseMessage = 'File saved - preview updating automatically via hot reload';
        containerStatus = 'watching';
        updateType = 'hot_reload';
        estimatedDuration = 1;
      } else if (isPackageChange) {
        // For package.json changes, we do need to restart the container
        const restartSuccess = await editingSessionManager.restartPreviewContainer(
          activeSession.id, 
          [filepath]
        ).catch(err => {
          console.error(`Container restart failed: ${err}`);
          return false;
        });
        
        if (restartSuccess === true) {
          responseMessage = 'File saved and preview restarted for package changes';
          containerStatus = 'restarted';
          updateType = 'container_restart';
          estimatedDuration = 20;
        } else {
          responseMessage = 'File saved, but preview restart failed';
          containerStatus = 'failed';
          updateType = 'failed';
        }
      } else {
        responseMessage = 'File saved to preview environment';
        containerStatus = 'updated';
        updateType = 'live_update';
        estimatedDuration = 2;
      }
    }
    
    return c.json({ 
      success: true, 
      message: responseMessage,
      containerStatus,
      updateType,
      estimatedDuration,
      hasActiveSession: !!activeSession,
      writeSource,
      branchName: activeSession?.branchName,
      commitHash,
      containerName: activeSession?.containerName,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error saving file:', error);
    return c.json({ success: false, error: 'Failed to save file' });
  }
});

// Create new file or folder
fileRoutes.post('/sites/:sitename/file', async (c: HonoContext) => {
  const user = c.get('user');
  const siteName = c.req.param('sitename');
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    const { path: filePath, type, content = '' } = await c.req.json();
    
    if (!filePath || !type) {
      return c.json({ success: false, error: 'Path and type are required' });
    }
    
    // Sanitize and validate file path
    const cleanPath = sanitizePath(filePath);
    const fullPath = join(sitePath, cleanPath);
    
    // Ensure the path is within the site directory
    if (!fullPath.startsWith(sitePath)) {
      return c.json({ success: false, error: 'Invalid path' });
    }
    
    if (existsSync(fullPath)) {
      return c.json({ success: false, error: 'File or folder already exists' });
    }
    
    if (type === 'folder') {
      await mkdir(fullPath, { recursive: true });
    } else {
      // Ensure parent directory exists
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      
      await writeFile(fullPath, content, 'utf-8');
    }
    
    return c.json({ 
      success: true, 
      message: `${type} created successfully`,
      editMode: false,  // TODO: Check for active session
      branchName: undefined
    });
    
  } catch (error) {
    console.error('Error creating file/folder:', error);
    return c.json({ success: false, error: 'Failed to create file/folder' });
  }
});

// Delete file or folder
fileRoutes.delete('/sites/:sitename/file/:filepath{.+}', async (c: HonoContext) => {
  const user = c.get('user');
  const siteName = c.req.param('sitename');
  const filepath = c.req.param('filepath');
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    // Sanitize and validate file path
    const cleanPath = sanitizePath(filepath);
    const fullPath = join(sitePath, cleanPath);
    
    // Ensure the path is within the site directory
    if (!fullPath.startsWith(sitePath) || fullPath === sitePath) {
      return c.json({ success: false, error: 'Invalid path' });
    }
    
    if (!existsSync(fullPath)) {
      return c.json({ success: false, error: 'File or folder not found' });
    }
    
    // Delete file or folder
    const stats = await stat(fullPath);
    if (stats.isDirectory()) {
      // For safety, only delete empty directories
      const entries = await readdir(fullPath);
      if (entries.length > 0) {
        return c.json({ success: false, error: 'Directory is not empty' });
      }
      await unlink(fullPath);
    } else {
      await unlink(fullPath);
    }
    
    return c.json({ success: true, message: 'Deleted successfully' });
    
  } catch (error) {
    console.error('Error deleting file/folder:', error);
    return c.json({ success: false, error: 'Failed to delete' });
  }
});

export { fileRoutes };