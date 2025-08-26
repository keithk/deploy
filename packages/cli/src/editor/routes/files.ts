import { Hono } from 'hono';
import { join, resolve, relative, dirname } from 'path';
import { readdir, readFile, writeFile, mkdir, unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { Database } from '@keithk/deploy-core/src/database/database';
import { requireAuth } from './auth';
import { sanitizePath, isEditableFile, getFileLanguage } from '../utils/site-helpers';
import { editingSessionManager } from '@keithk/deploy-server/src/services/editing-session-manager';
import { gogsClient } from '@keithk/deploy-server/src/services/simple-gogs-client';

const fileRoutes = new Hono();

// Apply authentication to all file routes
fileRoutes.use('*', requireAuth);

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
      // Skip hidden files and node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
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
fileRoutes.get('/sites/:sitename/tree', async (c) => {
  const user = c.get('user');
  const siteName = c.req.param('sitename');
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    if (!existsSync(sitePath)) {
      return c.json({ success: false, error: 'Site directory not found' });
    }
    
    const tree = await buildFileTree(sitePath, sitePath);
    
    return c.json({ success: true, tree });
    
  } catch (error) {
    console.error('Error loading file tree:', error);
    return c.json({ success: false, error: 'Failed to load file tree' });
  }
});

// Read file content
fileRoutes.get('/sites/:sitename/file/:filepath{.+}', async (c) => {
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
    
    // Ensure the file is within the site directory
    if (!fullPath.startsWith(sitePath)) {
      return c.json({ success: false, error: 'Invalid file path' });
    }
    
    if (!existsSync(fullPath)) {
      return c.json({ success: false, error: 'File not found' });
    }
    
    // Check if it's a file
    const stats = await stat(fullPath);
    if (!stats.isFile()) {
      return c.json({ success: false, error: 'Not a file' });
    }
    
    // Check if file is editable
    if (!isEditableFile(fullPath)) {
      return c.json({ success: false, error: 'File type not editable' });
    }
    
    // Read file content
    const content = await readFile(fullPath, 'utf-8');
    
    return c.json({ 
      success: true, 
      content,
      language: getFileLanguage(fullPath)
    });
    
  } catch (error) {
    console.error('Error reading file:', error);
    return c.json({ success: false, error: 'Failed to read file' });
  }
});

// Save file content
fileRoutes.put('/sites/:sitename/file/:filepath{.+}', async (c) => {
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
    
    if (activeSession) {
      // Save to Git branch via Gogs API instead of local file
      try {
        console.log(`Saving file ${filepath} to Git branch ${activeSession.branch_name} via Gogs`);
        await gogsClient.updateFile(
          siteName,
          filepath,
          content,
          activeSession.branch_name,
          `Update ${filepath}`
        );
        console.log(`File saved to Git successfully`);
        
        // Restart container (will pull latest changes)
        console.log(`Restarting preview container for session ${activeSession.id} after Git save`);
        editingSessionManager.restartPreviewContainer(activeSession.id)
          .catch(err => console.error(`Failed to restart preview container: ${err}`));
        
      } catch (gitError) {
        console.error(`Failed to save file to Git: ${gitError}`);
        // Fallback to local file save if Git fails
        console.log(`Falling back to local file save for ${filepath}`);
        await writeFile(fullPath, content, 'utf-8');
      }
    } else {
      // No active session - save to local filesystem (normal behavior)
      console.log(`No active editing session - saving ${filepath} locally`);
      await writeFile(fullPath, content, 'utf-8');
    }
    
    // Update last_edited in database
    const db = Database.getInstance();
    db.run(
      `UPDATE sites SET last_edited = CURRENT_TIMESTAMP WHERE name = ?`,
      [siteName]
    );
    
    return c.json({ success: true, message: 'File saved successfully' });
    
  } catch (error) {
    console.error('Error saving file:', error);
    return c.json({ success: false, error: 'Failed to save file' });
  }
});

// Create new file or folder
fileRoutes.post('/sites/:sitename/file', async (c) => {
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
    
    return c.json({ success: true, message: `${type} created successfully` });
    
  } catch (error) {
    console.error('Error creating file/folder:', error);
    return c.json({ success: false, error: 'Failed to create file/folder' });
  }
});

// Delete file or folder
fileRoutes.delete('/sites/:sitename/file/:filepath{.+}', async (c) => {
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