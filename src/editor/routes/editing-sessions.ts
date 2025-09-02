import { Hono } from 'hono';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { Database } from '../../core/database/database';
import { requireAuth } from './auth';
import { editingSessionManager } from '../../server/services/editing-session-manager';
import type { AuthenticatedContext, AuthenticatedUser } from '@core/types';

const editingSessionRoutes = new Hono<AuthenticatedContext>();

// Apply authentication to all editing session routes
editingSessionRoutes.use('*', requireAuth);

/**
 * Check if user has access to a site
 */
async function checkSiteAccess(siteName: string, userId: number, isAdmin: boolean): Promise<{ hasAccess: boolean; sitePath?: string }> {
  const db = Database.getInstance();
  
  console.log(`Checking site access: siteName=${siteName}, userId=${userId}, isAdmin=${isAdmin}`);
  
  // Attempt to get database connection details
  try {
    const tables = db.query('SELECT name FROM sqlite_master WHERE type="table"');
    console.log('Available tables:', tables.map(t => t.name));
  } catch (dbError) {
    console.error('Database connection error:', dbError);
  }
  
  let sites;
  try {
    sites = db.query<{ user_id: number; path: string }>(
      `SELECT user_id, path FROM sites WHERE name = ?`,
      [siteName]
    );
  } catch (queryError) {
    console.error(`Query error for site ${siteName}:`, queryError);
    return { hasAccess: false };
  }
  
  console.log(`Found ${sites.length} sites matching name: ${siteName}`);
  
  if (sites.length === 0) {
    console.warn(`No site found with name: ${siteName}`);
    return { hasAccess: false };
  }
  
  const site = sites[0];
  if (!site) {
    console.warn(`Unexpected: sites array has 0 length but wasn't caught earlier`);
    return { hasAccess: false };
  }
  
  console.log(`Site details: user_id=${site.user_id}, path=${site.path}`);
  
  if (site.user_id !== userId && !isAdmin) {
    console.warn(`Access denied: userId ${userId} does not match site owner ${site.user_id} and is not admin`);
    return { hasAccess: false };
  }
  
  const sitePath = site.path.startsWith('/')
    ? site.path
    : resolve(process.env.ROOT_DIR || './sites', siteName);
  
  console.log(`Resolved site path: ${sitePath}`);
  
  // Additional checks
  const { existsSync } = require('fs');
  if (!existsSync(sitePath)) {
    console.error(`Site path does not exist: ${sitePath}`);
    return { hasAccess: false };
  }
    
  return { hasAccess: true, sitePath };
}

// Start editing session
editingSessionRoutes.post('/sites/:sitename/edit/start', async (c) => {
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
    
    // Check if user already has an active session for this site
    const existingSession = await editingSessionManager.getActiveSession(user.id, siteName);
    
    if (existingSession) {
      return c.json({ 
        success: true, 
        session: existingSession,
        message: 'Restored existing editing session'
      });
    }
    
    // Create new editing session
    const session = await editingSessionManager.createSession({
      userId: user.id,
      siteName,
      sitePath
    });
    
    return c.json({ 
      success: true, 
      session,
      message: 'Editing session created successfully'
    });
    
  } catch (error) {
    console.error('Error starting editing session:', error);
    
    // Enhanced error logging
    const detailedErrorLog = {
      message: 'Failed to start editing session',
      siteName,
      userId: user.id,
      timestamp: new Date().toISOString(),
      errorDetails: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    };
    
    console.error('Detailed Error Log:', JSON.stringify(detailedErrorLog, null, 2));
    
    return c.json({ 
      success: false, 
      error: 'Failed to start editing session',
      details: {
        message: error.message,
        name: error.name
      }
    });
  }
});

// Get editing session status
editingSessionRoutes.get('/sites/:sitename/edit/status', async (c) => {
  const user = c.get('user');
  const siteName = c.req.param('sitename');
  
  try {
    const { hasAccess } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    // Get active session if it exists
    const session = await editingSessionManager.getActiveSession(user.id, siteName);
    
    return c.json({ 
      success: true, 
      editing: !!session,
      session: session || null
    });
    
  } catch (error) {
    console.error('Error getting editing session status:', error);
    return c.json({ success: false, error: 'Failed to get session status' });
  }
});

// Commit changes in editing session
editingSessionRoutes.post('/sites/:sitename/edit/:sessionId/commit', async (c) => {
  const user = c.get('user');
  const siteName = c.req.param('sitename');
  const sessionId = parseInt(c.req.param('sessionId'));
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    const { message } = await c.req.json();
    
    // Get session to verify ownership
    const session = await editingSessionManager.getSession(sessionId);
    
    if (!session || session.userId !== user.id) {
      return c.json({ success: false, error: 'Session not found or access denied' });
    }
    
    // Commit changes
    const commitHash = await editingSessionManager.commitSession(sessionId, sitePath, {
      message: message || 'Save changes',
      author: user.username || 'Anonymous'
    });
    
    // Update activity timestamp
    await editingSessionManager.updateActivity(sessionId);
    
    // Get updated session
    const updatedSession = await editingSessionManager.getSession(sessionId);
    
    return c.json({ 
      success: true,
      commitHash,
      session: updatedSession,
      message: 'Changes committed successfully'
    });
    
  } catch (error) {
    console.error('Error committing changes:', error);
    return c.json({ success: false, error: 'Failed to commit changes' });
  }
});

// Deploy editing session (merge to main)
editingSessionRoutes.post('/sites/:sitename/edit/:sessionId/deploy', async (c) => {
  const user = c.get('user');
  const siteName = c.req.param('sitename');
  const sessionId = parseInt(c.req.param('sessionId'));
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    // Get session to verify ownership
    const session = await editingSessionManager.getSession(sessionId);
    
    if (!session || session.userId !== user.id) {
      return c.json({ success: false, error: 'Session not found or access denied' });
    }
    
    // Deploy changes (merge to main)
    await editingSessionManager.deploySession(sessionId, sitePath);
    
    return c.json({ 
      success: true,
      message: 'Changes deployed successfully'
    });
    
  } catch (error) {
    console.error('Error deploying changes:', error);
    return c.json({ success: false, error: 'Failed to deploy changes' });
  }
});

// Cancel editing session
editingSessionRoutes.delete('/sites/:sitename/edit/:sessionId', async (c) => {
  const user = c.get('user');
  const siteName = c.req.param('sitename');
  const sessionId = parseInt(c.req.param('sessionId'));
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    // Get session to verify ownership
    const session = await editingSessionManager.getSession(sessionId);
    
    if (!session || session.userId !== user.id) {
      return c.json({ success: false, error: 'Session not found or access denied' });
    }
    
    // Cancel session
    await editingSessionManager.cancelSession(sessionId, sitePath);
    
    return c.json({ 
      success: true,
      message: 'Editing session cancelled successfully'
    });
    
  } catch (error) {
    console.error('Error canceling editing session:', error);
    return c.json({ success: false, error: 'Failed to cancel editing session' });
  }
});

export { editingSessionRoutes };