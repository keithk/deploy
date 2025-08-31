import { Hono } from 'hono';
import { requireAdmin } from './auth';
import { UserModel } from '../../core/database/models/user';
import { Database } from '../../core/database/database';

const userModel = new UserModel();
const dashboardRoutes = new Hono();

// Apply admin authentication to all dashboard routes
dashboardRoutes.use('*', requireAdmin);

// Main dashboard
dashboardRoutes.get('/', async (c) => {
  const user = c.get('user');
  
  try {
    // Get system stats
    const db = Database.getInstance();
    
    // User stats
    const totalUsers = userModel.getUserCount();
    const activeUsers = db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM users WHERE is_active = 1`
    )[0]?.count || 0;
    
    // Site stats (from both old processes and new sites tables)
    const totalSites = db.query<{ count: number }>(
      `SELECT 
         (SELECT COUNT(*) FROM processes) + 
         (SELECT COUNT(*) FROM sites) 
       as count`
    )[0]?.count || 0;
    
    const runningSites = db.query<{ count: number }>(
      `SELECT 
         (SELECT COUNT(*) FROM processes WHERE status = 'running') + 
         (SELECT COUNT(*) FROM sites WHERE status = 'running') 
       as count`
    )[0]?.count || 0;
    
    // Recent activity (simplified for now)
    const recentUsers = userModel.getAllUsers(0, 5);
    
    // System settings
    const settings = db.query<{ key: string; value: string }>(
      `SELECT key, value FROM system_settings`
    );
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
    
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Dashboard - Dial Up Deploy</title>
        <link rel="stylesheet" href="/static/admin.css">
      </head>
      <body>
        <div class="admin-container">
          <header class="admin-header">
            <div class="admin-title">Dial Up Deploy</div>
            <div class="admin-user">
              ${user.username} (Admin) | 
              <a href="/auth/logout" style="color: var(--accent-red);">Logout</a>
            </div>
          </header>
          
          <nav class="admin-nav">
            <ul class="nav-list">
              <li class="nav-item">
                <a href="/dashboard" class="nav-link active">Dashboard</a>
              </li>
              <li class="nav-item">
                <a href="/users" class="nav-link">Users (${totalUsers})</a>
              </li>
              <li class="nav-item">
                <a href="/users/sites" class="nav-link">Sites (${totalSites})</a>
              </li>
              <li class="nav-item">
                <a href="/settings" class="nav-link">Settings</a>
              </li>
            </ul>
          </nav>
          
          <main class="admin-main">
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-label">
                  <span class="stat-icon">👥</span>
                  TOTAL USERS
                </div>
                <div class="stat-value">${totalUsers}</div>
              </div>
              
              <div class="stat-card ${activeUsers < totalUsers ? 'warning' : ''}">
                <div class="stat-label">
                  <span class="stat-icon">✅</span>
                  ACTIVE USERS
                </div>
                <div class="stat-value">${activeUsers}</div>
              </div>
              
              <div class="stat-card">
                <div class="stat-label">
                  <span class="stat-icon">🌐</span>
                  TOTAL SITES
                </div>
                <div class="stat-value">${totalSites}</div>
              </div>
              
              <div class="stat-card ${runningSites > 0 ? '' : 'error'}">
                <div class="stat-label">
                  <span class="stat-icon">🚀</span>
                  RUNNING SITES
                </div>
                <div class="stat-value">${runningSites}</div>
              </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
              <div class="panel">
                <div class="panel-header">
                  <h2 class="panel-title">Recent Activity</h2>
                  <div class="panel-actions">
                    <a href="/users" class="btn small">View All Users</a>
                  </div>
                </div>
                
                <div class="activity-log">
                  ${recentUsers.map(u => `
                    <div class="activity-item">
                      <span class="activity-time">${new Date(u.created_at).toLocaleDateString()}</span>
                      <span class="activity-user">${u.username}</span>
                      <span class="activity-action">joined</span>
                      ${u.is_admin ? '<span class="status-badge admin">admin</span>' : ''}
                    </div>
                  `).join('')}
                  
                  ${recentUsers.length === 0 ? '<div class="activity-item">No recent activity</div>' : ''}
                </div>
              </div>
              
              <div class="panel">
                <div class="panel-header">
                  <h2 class="panel-title">System Status</h2>
                  <div class="panel-actions">
                    <a href="/settings" class="btn small">Configure</a>
                  </div>
                </div>
                
                <div class="activity-log">
                  <div class="activity-item">
                    <span class="activity-action">Registration:</span>
                    <span class="status-badge ${settingsMap.registration_enabled === 'true' ? 'active' : 'inactive'}">
                      ${settingsMap.registration_enabled === 'true' ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  
                  <div class="activity-item">
                    <span class="activity-action">Admin Domain:</span>
                    <span style="color: var(--accent-blue);">${settingsMap.admin_domain || 'admin'}</span>
                  </div>
                  
                  <div class="activity-item">
                    <span class="activity-action">Editor Domain:</span>
                    <span style="color: var(--accent-blue);">${settingsMap.editor_domain || 'editor'}</span>
                  </div>
                  
                  <div class="activity-item">
                    <span class="activity-action">Default Limits:</span>
                    <span style="color: var(--text-secondary);">
                      ${settingsMap.default_max_sites || '3'} sites, 
                      ${settingsMap.default_max_memory || '512'}MB RAM
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">Quick Actions</h2>
              </div>
              
              <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <a href="/users/create" class="btn success">+ Create User</a>
                <a href="/users" class="btn">Manage Users</a>
                <a href="/settings" class="btn">System Settings</a>
                <a href="/users/sites" class="btn">View All Sites</a>
              </div>
            </div>
          </main>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Dashboard error:', error);
    return c.html(`
      <div class="message error">
        Error loading dashboard: ${error}
      </div>
    `);
  }
});

export { dashboardRoutes };