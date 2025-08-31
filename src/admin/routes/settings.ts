import { Hono } from 'hono';
import { requireAdmin } from './auth';
import { Database } from '../../core/database/database';

const settingsRoutes = new Hono();

// Apply admin authentication to all settings routes
settingsRoutes.use('*', requireAdmin);

// Settings page
settingsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const error = c.req.query('error');
  const success = c.req.query('success');
  
  try {
    const db = Database.getInstance();
    const settings = db.query<{ key: string; value: string; description: string }>(
      `SELECT key, value, description FROM system_settings ORDER BY key`
    );
    
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s]));
    
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Settings - Admin Panel</title>
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
                <a href="/dashboard" class="nav-link">Dashboard</a>
              </li>
              <li class="nav-item">
                <a href="/users" class="nav-link">Users</a>
              </li>
              <li class="nav-item">
                <a href="/users/sites" class="nav-link">Sites</a>
              </li>
              <li class="nav-item">
                <a href="/settings" class="nav-link active">Settings</a>
              </li>
            </ul>
          </nav>
          
          <main class="admin-main">
            ${error ? `<div class="message error">${error}</div>` : ''}
            ${success ? `<div class="message success">${success}</div>` : ''}
            
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">System Settings</h2>
              </div>
              
              <form method="POST" action="/settings">
                <h3 style="color: var(--accent-blue); margin-bottom: 1rem;">Registration Settings</h3>
                
                <div class="form-group">
                  <label class="form-label">
                    <input 
                      type="checkbox" 
                      name="registration_enabled" 
                      value="true"
                      ${settingsMap.registration_enabled?.value === 'true' ? 'checked' : ''}
                    > 
                    Allow new user registration
                  </label>
                  <small style="color: var(--text-secondary); font-size: 0.8rem; display: block; margin-top: 0.5rem;">
                    When enabled, users can register at editor.yourdomain/register
                  </small>
                </div>
                
                <h3 style="color: var(--accent-blue); margin: 2rem 0 1rem 0;">Domain Configuration</h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                  <div class="form-group">
                    <label class="form-label" for="admin_domain">Admin Subdomain</label>
                    <input 
                      type="text" 
                      id="admin_domain" 
                      name="admin_domain" 
                      class="form-input" 
                      value="${settingsMap.admin_domain?.value || 'admin'}"
                      pattern="[a-z0-9-]+"
                      placeholder="admin"
                    >
                    <small style="color: var(--text-secondary); font-size: 0.8rem;">
                      Admin panel will be at [subdomain].yourdomain
                    </small>
                  </div>
                  
                  <div class="form-group">
                    <label class="form-label" for="editor_domain">Editor Subdomain</label>
                    <input 
                      type="text" 
                      id="editor_domain" 
                      name="editor_domain" 
                      class="form-input" 
                      value="${settingsMap.editor_domain?.value || 'editor'}"
                      pattern="[a-z0-9-]+"
                      placeholder="editor"
                    >
                    <small style="color: var(--text-secondary); font-size: 0.8rem;">
                      Code editor will be at [subdomain].yourdomain
                    </small>
                  </div>
                </div>
                
                <h3 style="color: var(--accent-blue); margin: 2rem 0 1rem 0;">Default User Limits</h3>
                <small style="color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 1rem; display: block;">
                  These limits are applied to new users by default
                </small>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                  <div class="form-group">
                    <label class="form-label" for="default_max_sites">Max Sites</label>
                    <input 
                      type="number" 
                      id="default_max_sites" 
                      name="default_max_sites" 
                      class="form-input" 
                      min="1"
                      max="50"
                      value="${settingsMap.default_max_sites?.value || '3'}"
                    >
                  </div>
                  
                  <div class="form-group">
                    <label class="form-label" for="default_max_memory">Memory Limit (MB)</label>
                    <input 
                      type="number" 
                      id="default_max_memory" 
                      name="default_max_memory" 
                      class="form-input" 
                      min="128"
                      max="4096"
                      step="128"
                      value="${settingsMap.default_max_memory?.value || '512'}"
                    >
                  </div>
                  
                  <div class="form-group">
                    <label class="form-label" for="default_max_cpu">CPU Limit (cores)</label>
                    <input 
                      type="number" 
                      id="default_max_cpu" 
                      name="default_max_cpu" 
                      class="form-input" 
                      min="0.1"
                      max="2.0"
                      step="0.1"
                      value="${settingsMap.default_max_cpu?.value || '0.5'}"
                    >
                  </div>
                  
                  <div class="form-group">
                    <label class="form-label" for="default_max_storage">Storage Limit (MB)</label>
                    <input 
                      type="number" 
                      id="default_max_storage" 
                      name="default_max_storage" 
                      class="form-input" 
                      min="256"
                      max="8192"
                      step="256"
                      value="${settingsMap.default_max_storage?.value || '1024'}"
                    >
                  </div>
                </div>
                
                <div class="form-group" style="margin-top: 2rem;">
                  <button type="submit" class="btn success">Save Settings</button>
                  <a href="/dashboard" class="btn" style="margin-left: 0.5rem;">Cancel</a>
                </div>
              </form>
            </div>
            
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">System Information</h2>
              </div>
              
              <div class="activity-log">
                <div class="activity-item">
                  <span class="activity-action">Platform:</span>
                  <span style="color: var(--accent-blue);">Dial Up Deploy Community Edition</span>
                </div>
                
                <div class="activity-item">
                  <span class="activity-action">Runtime:</span>
                  <span style="color: var(--accent-blue);">Bun ${process.versions.bun || 'Unknown'}</span>
                </div>
                
                <div class="activity-item">
                  <span class="activity-action">Database:</span>
                  <span style="color: var(--accent-blue);">SQLite</span>
                </div>
                
                <div class="activity-item">
                  <span class="activity-action">Admin Panel Port:</span>
                  <span style="color: var(--accent-blue);">${process.env.ADMIN_PORT || '3001'}</span>
                </div>
              </div>
            </div>
          </main>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Settings page error:', error);
    return c.html(`
      <div class="message error">
        Error loading settings: ${error}
      </div>
    `);
  }
});

// Save settings
settingsRoutes.post('/', async (c) => {
  const formData = await c.req.parseBody();
  
  try {
    const db = Database.getInstance();
    
    // Update each setting
    const updates = [
      ['registration_enabled', formData.registration_enabled === 'true' ? 'true' : 'false'],
      ['admin_domain', formData.admin_domain || 'admin'],
      ['editor_domain', formData.editor_domain || 'editor'],
      ['default_max_sites', formData.default_max_sites || '3'],
      ['default_max_memory', formData.default_max_memory || '512'],
      ['default_max_cpu', formData.default_max_cpu || '0.5'],
      ['default_max_storage', formData.default_max_storage || '1024']
    ];
    
    for (const [key, value] of updates) {
      db.run(
        `INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [key, value]
      );
    }
    
    return c.redirect('/settings?success=Settings saved successfully');
    
  } catch (error) {
    console.error('Save settings error:', error);
    return c.redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }
});

export { settingsRoutes };