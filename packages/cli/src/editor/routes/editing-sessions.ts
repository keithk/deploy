import { Hono } from 'hono';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { Database } from '@keithk/deploy-core/src/database/database';
import { requireAuth } from './auth';
import { editingSessionManager } from '@keithk/deploy-server/src/services/editing-session-manager';

const editingSessionRoutes = new Hono();

// Apply authentication to all editing session routes
editingSessionRoutes.use('*', requireAuth);

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
    return c.json({ success: false, error: 'Failed to start editing session' });
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