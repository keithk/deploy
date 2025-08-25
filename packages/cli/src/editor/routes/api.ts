import { Hono } from 'hono';
import { Database } from '@keithk/deploy-core/src/database/database';
import { requireAuth } from './auth';
import { getSiteDomain } from '../utils/site-helpers';

const apiRoutes = new Hono();

// Apply authentication to all API routes
apiRoutes.use('*', requireAuth);

// Claim an unclaimed site
apiRoutes.post('/sites/claim', async (c) => {
  const user = c.get('user');
  
  try {
    const { siteName } = await c.req.json();
    
    if (!siteName) {
      return c.json({ success: false, error: 'Site name is required' });
    }
    
    const db = Database.getInstance();
    
    // Check if site already exists in database
    const existing = db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM sites WHERE name = ?`,
      [siteName]
    );
    
    if (existing[0].count > 0) {
      return c.json({ success: false, error: 'Site is already claimed' });
    }
    
    // Check user's site limit
    const userSites = db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM sites WHERE user_id = ?`,
      [user.id]
    );
    
    if (userSites[0].count >= user.max_sites) {
      return c.json({ success: false, error: 'Site limit reached' });
    }
    
    // Get site path from filesystem
    const rootDir = process.env.ROOT_DIR || './sites';
    const sitePath = `${rootDir}/${siteName}`;
    
    // Create database entry
    db.run(
      `INSERT INTO sites (user_id, name, domain, path, status, created_at, last_edited)
       VALUES (?, ?, ?, ?, 'stopped', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [user.id, siteName, getSiteDomain(siteName), sitePath]
    );
    
    return c.json({ success: true, message: 'Site claimed successfully' });
    
  } catch (error) {
    console.error('Claim site error:', error);
    return c.json({ success: false, error: 'Failed to claim site' });
  }
});

export { apiRoutes };