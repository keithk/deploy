import { Hono } from 'hono';
import { join, resolve } from 'path';
import { readdirSync, statSync, existsSync } from 'fs';
import { Database } from '@keithk/deploy-core/src/database/database';
import { requireAuth } from './auth';
import { getSiteUrl } from '../utils/site-helpers';

const dashboardRoutes = new Hono();

// Apply authentication to all dashboard routes
dashboardRoutes.use('*', requireAuth);

interface Site {
  id?: number;
  name: string;
  domain?: string;
  path: string;
  status: string;
  type: 'database' | 'filesystem' | 'unclaimed';
  owner?: string;
  user_id?: number;
  created_at?: string;
  last_edited?: string;
}

/**
 * Discover sites from filesystem
 */
function discoverFilesystemSites(rootDir: string): Site[] {
  const sites: Site[] = [];
  
  if (!existsSync(rootDir)) {
    return sites;
  }
  
  try {
    const entries = readdirSync(rootDir);
    
    for (const entry of entries) {
      const sitePath = join(rootDir, entry);
      
      try {
        const stat = statSync(sitePath);
        
        if (stat.isDirectory()) {
          // Check if it looks like a site (has common files)
          const commonFiles = ['index.html', 'index.js', 'index.ts', 'package.json'];
          const hasCommonFile = commonFiles.some(file => existsSync(join(sitePath, file)));
          
          if (hasCommonFile) {
            sites.push({
              name: entry,
              path: sitePath,
              status: 'stopped',
              type: 'filesystem',
              last_edited: stat.mtime.toISOString()
            });
          }
        }
      } catch (err) {
        // Skip invalid directories
        continue;
      }
    }
  } catch (err) {
    console.error('Error discovering filesystem sites:', err);
  }
  
  return sites;
}

/**
 * Get all sites for a user (database + filesystem)
 */
async function getAllSites(userId: number, isAdmin: boolean = false): Promise<Site[]> {
  const db = Database.getInstance();
  const sites: Site[] = [];
  
  // Get sites from database
  try {
    const query = isAdmin
      ? `SELECT s.*, u.username FROM sites s LEFT JOIN users u ON s.user_id = u.id ORDER BY s.created_at DESC`
      : `SELECT s.*, u.username FROM sites s LEFT JOIN users u ON s.user_id = u.id WHERE s.user_id = ? ORDER BY s.created_at DESC`;
    
    const params = isAdmin ? [] : [userId];
    const dbSites = db.query<any>(query, params);
    
    for (const site of dbSites) {
      sites.push({
        id: site.id,
        name: site.name,
        domain: site.domain,
        path: site.path,
        status: site.status || 'stopped',
        type: 'database',
        owner: site.username,
        user_id: site.user_id,
        created_at: site.created_at,
        last_edited: site.last_edited
      });
    }
  } catch (err) {
    console.error('Error querying database sites:', err);
  }
  
  // Get sites from filesystem
  const rootDir = process.env.ROOT_DIR || resolve(process.cwd(), 'sites');
  const fsSites = discoverFilesystemSites(rootDir);
  
  // Mark filesystem sites as unclaimed if not in database
  const dbSiteNames = new Set(sites.map(s => s.name));
  
  for (const fsSite of fsSites) {
    if (!dbSiteNames.has(fsSite.name)) {
      sites.push({
        ...fsSite,
        type: 'unclaimed'
      });
    }
  }
  
  return sites;
}

// Dashboard page
dashboardRoutes.get('/', async (c) => {
  const user = c.get('user');
  
  try {
    const sites = await getAllSites(user.id, user.is_admin);
    
    // Separate sites by type
    const mySites = sites.filter(s => s.type === 'database' && s.user_id === user.id);
    const unclaimedSites = sites.filter(s => s.type === 'unclaimed');
    const otherSites = user.is_admin 
      ? sites.filter(s => s.type === 'database' && s.user_id !== user.id)
      : [];
    
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard - Code Editor</title>
        <link rel="stylesheet" href="/static/editor.css">
      </head>
      <body>
        <div class="editor-container">
          <header class="editor-header">
            <div class="editor-title">Code Editor</div>
            <div class="editor-user">
              ${user.username} ${user.is_admin ? '(Admin)' : ''} | 
              <a href="/auth/logout" style="color: var(--accent-red);">Logout</a>
            </div>
          </header>
          
          <main class="editor-main">
            <div class="dashboard-welcome">
              <h1>Welcome back, ${user.username}!</h1>
              <p>Manage your sites and start coding</p>
            </div>
            
            <!-- My Sites -->
            <div class="sites-section">
              <div class="section-header">
                <h2>My Sites</h2>
                <span class="site-count">${mySites.length}</span>
              </div>
              
              ${mySites.length === 0 ? `
                <div class="empty-state">
                  <p>No sites yet. Create your first site to get started!</p>
                  <button class="btn primary">Create New Site</button>
                </div>
              ` : `
                <div class="sites-grid">
                  ${mySites.map(site => `
                    <div class="site-card">
                      <div class="site-header">
                        <h3 class="site-name">
                          <a href="/editor/${site.name}">${site.name}</a>
                        </h3>
                        <span class="site-status status-${site.status}">${site.status}</span>
                      </div>
                      
                      <div class="site-info">
                        ${site.domain ? `<p class="site-domain">🌐 ${site.domain}</p>` : ''}
                        <p class="site-path">📁 ${site.path}</p>
                        ${site.last_edited ? `<p class="site-date">✏️ ${new Date(site.last_edited).toLocaleDateString()}</p>` : ''}
                      </div>
                      
                      <div class="site-actions">
                        <a href="/editor/${site.name}" class="btn small">Edit Code</a>
                        <a href="${getSiteUrl(site.name)}" target="_blank" class="btn small secondary">Visit Site</a>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
            
            <!-- Unclaimed Sites -->
            ${unclaimedSites.length > 0 ? `
              <div class="sites-section">
                <div class="section-header">
                  <h2>Unclaimed Sites</h2>
                  <span class="site-count">${unclaimedSites.length}</span>
                </div>
                <p class="section-description">These sites exist in the filesystem but aren't assigned to any user yet.</p>
                
                <div class="sites-grid">
                  ${unclaimedSites.map(site => `
                    <div class="site-card unclaimed">
                      <div class="site-header">
                        <h3 class="site-name">${site.name}</h3>
                        <span class="site-status status-unclaimed">unclaimed</span>
                      </div>
                      
                      <div class="site-info">
                        <p class="site-path">📁 ${site.path}</p>
                        ${site.last_edited ? `<p class="site-date">✏️ ${new Date(site.last_edited).toLocaleDateString()}</p>` : ''}
                      </div>
                      
                      <div class="site-actions">
                        <button class="btn small primary" onclick="claimSite('${site.name}')">Claim Site</button>
                        <a href="/editor/${site.name}?preview=true" class="btn small secondary">Preview</a>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
            
            <!-- Other Sites (Admin only) -->
            ${user.is_admin && otherSites.length > 0 ? `
              <div class="sites-section">
                <div class="section-header">
                  <h2>All User Sites</h2>
                  <span class="site-count">${otherSites.length}</span>
                </div>
                
                <div class="sites-grid">
                  ${otherSites.map(site => `
                    <div class="site-card">
                      <div class="site-header">
                        <h3 class="site-name">
                          <a href="/editor/${site.name}">${site.name}</a>
                        </h3>
                        <span class="site-owner">by ${site.owner}</span>
                      </div>
                      
                      <div class="site-info">
                        ${site.domain ? `<p class="site-domain">🌐 ${site.domain}</p>` : ''}
                        <p class="site-path">📁 ${site.path}</p>
                        ${site.created_at ? `<p class="site-date">📅 ${new Date(site.created_at).toLocaleDateString()}</p>` : ''}
                      </div>
                      
                      <div class="site-actions">
                        <a href="/editor/${site.name}" class="btn small">View/Edit</a>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </main>
        </div>
        
        <script>
          function claimSite(siteName) {
            if (confirm(\`Claim the site "\${siteName}" as your own?\`)) {
              fetch('/api/sites/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteName })
              })
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  location.reload();
                } else {
                  alert('Failed to claim site: ' + data.error);
                }
              })
              .catch(err => {
                alert('Error claiming site: ' + err.message);
              });
            }
          }
        </script>
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