import { Hono } from 'hono';
import { join, resolve } from 'path';
import { readdirSync, statSync, existsSync } from 'fs';
import { Database } from '../../core/database/database';
import { requireAuth } from './auth';
import { getSiteUrl } from '../utils/site-helpers';
import { AuthenticatedContext, AppContext } from '@core/types';

const dashboardRoutes = new Hono<AuthenticatedContext>();

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
  
  if (!user) {
    return c.redirect('/auth/login');
  }
  
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
                <span class="site-count">${mySites.length} / ${user.max_sites || 10}</span>
                ${mySites.length < (user.max_sites || 10) ? `
                  <button id="create-new-site-btn" class="btn small primary">+ Create New Site</button>
                ` : ''}
              </div>
              
              ${mySites.length === 0 ? `
                <div class="empty-state">
                  <p>No sites yet. Create your first site to get started!</p>
                  <button id="create-new-site-btn" class="btn primary">Create New Site</button>
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
        
        <!-- Site Templates Modal -->
        <div id="templates-modal" class="templates-modal">
          <div class="templates-modal-content">
            <div class="templates-modal-header">
              <h2 style="margin: 0;">🚀 Create New Site</h2>
              <button id="close-templates-modal" class="btn small secondary">✕ Close</button>
            </div>
            
            <div class="templates-modal-body">
              <div class="templates-categories">
                <button class="templates-category-tab active" data-category="all">All Templates</button>
                <button class="templates-category-tab" data-category="frontend">Frontend</button>
                <button class="templates-category-tab" data-category="fullstack">Full-stack</button>
                <button class="templates-category-tab" data-category="api">API</button>
                <button class="templates-category-tab" data-category="static">Static</button>
              </div>
              
              <div class="templates-grid" id="templates-grid">
                <div class="template-loading">Loading templates...</div>
              </div>
              
              <!-- Site Creation Form -->
              <div id="create-site-form" class="create-site-form" style="display: none;">
                <h3 id="selected-template-name">Template Name</h3>
                <p id="selected-template-description">Template description</p>
                
                <div class="form-group">
                  <label for="site-name-input">Site Name</label>
                  <input id="site-name-input" type="text" placeholder="my-awesome-site" class="form-input">
                  <small>Only letters, numbers, and hyphens allowed</small>
                </div>
                
                <div class="form-actions">
                  <button id="create-site-btn" class="btn primary">Create Site</button>
                  <button id="cancel-create-btn" class="btn secondary">Cancel</button>
                </div>
                
                <!-- Progress Indicator -->
                <div id="creation-progress" class="creation-progress" style="display: none;">
                  <div class="progress-bar">
                    <div class="progress-fill"></div>
                  </div>
                  <p id="progress-text">Creating your site...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <style>
          /* Template Modal Styles */
          .templates-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 1000;
            overflow-y: auto;
          }
          
          .templates-modal.show {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
          }
          
          .templates-modal-content {
            background: var(--bg-dark);
            border: 2px solid var(--border);
            border-radius: 8px;
            width: 90%;
            max-width: 1000px;
            max-height: 90vh;
            overflow-y: auto;
          }
          
          .templates-modal-header {
            background: var(--bg-darker);
            padding: 1rem 1.5rem;
            border-bottom: 2px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .templates-modal-body {
            padding: 1.5rem;
          }
          
          .templates-categories {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1.5rem;
            flex-wrap: wrap;
          }
          
          .templates-category-tab {
            padding: 0.5rem 1rem;
            background: var(--bg-darker);
            border: 1px solid var(--border);
            color: var(--text-secondary);
            cursor: pointer;
            border-radius: 4px;
            font-size: 0.9rem;
          }
          
          .templates-category-tab.active,
          .templates-category-tab:hover {
            background: var(--accent-blue);
            color: white;
            border-color: var(--accent-blue);
          }
          
          .templates-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
          }
          
          .template-card {
            background: var(--bg-darker);
            border: 2px solid var(--border);
            border-radius: 8px;
            padding: 1rem;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          
          .template-card:hover {
            border-color: var(--accent-blue);
            transform: translateY(-2px);
          }
          
          .template-card.selected {
            border-color: var(--accent-green);
            background: rgba(72, 187, 120, 0.1);
          }
          
          .template-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 0.5rem;
          }
          
          .template-name {
            font-weight: bold;
            color: var(--text-primary);
            margin: 0;
          }
          
          .template-category {
            background: var(--accent-blue);
            color: white;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
          }
          
          .template-description {
            color: var(--text-secondary);
            margin: 0.5rem 0;
            font-size: 0.9rem;
          }
          
          .template-tags {
            display: flex;
            gap: 0.25rem;
            flex-wrap: wrap;
            margin-top: 0.5rem;
          }
          
          .template-tag {
            background: var(--bg-dark);
            color: var(--text-secondary);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
          }
          
          .create-site-form {
            background: var(--bg-darker);
            border: 2px solid var(--border);
            border-radius: 8px;
            padding: 1.5rem;
          }
          
          .form-group {
            margin-bottom: 1rem;
          }
          
          .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: var(--text-primary);
            font-weight: bold;
          }
          
          .form-input {
            width: 100%;
            padding: 0.5rem;
            background: var(--bg-dark);
            border: 1px solid var(--border);
            color: var(--text-primary);
            border-radius: 4px;
            font-size: 1rem;
          }
          
          .form-input:focus {
            outline: none;
            border-color: var(--accent-blue);
          }
          
          .form-group small {
            color: var(--text-secondary);
            font-size: 0.85rem;
          }
          
          .form-actions {
            display: flex;
            gap: 1rem;
            margin-top: 1.5rem;
          }
          
          .creation-progress {
            margin-top: 1rem;
          }
          
          .progress-bar {
            width: 100%;
            height: 8px;
            background: var(--bg-dark);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 0.5rem;
          }
          
          .progress-fill {
            height: 100%;
            background: var(--accent-blue);
            width: 0%;
            transition: width 0.3s ease;
            animation: progress-pulse 1.5s infinite;
          }
          
          @keyframes progress-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
          
          .template-loading {
            grid-column: 1 / -1;
            text-align: center;
            padding: 2rem;
            color: var(--text-secondary);
          }
          
          .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
          }
        </style>
        
        <script>
          // Site Templates Functionality
          let templatesData = null;
          let selectedTemplate = null;
          
          // Event listeners
          document.getElementById('create-new-site-btn')?.addEventListener('click', openTemplatesModal);
          document.getElementById('close-templates-modal')?.addEventListener('click', closeTemplatesModal);
          document.getElementById('cancel-create-btn')?.addEventListener('click', cancelSiteCreation);
          document.getElementById('create-site-btn')?.addEventListener('click', createSiteFromTemplate);
          
          // Category tabs
          document.querySelectorAll('.templates-category-tab').forEach(tab => {
            tab.addEventListener('click', () => switchTemplateCategory(tab.dataset.category));
          });
          
          // Close modal when clicking outside
          document.getElementById('templates-modal').addEventListener('click', (e) => {
            if (e.target.id === 'templates-modal') {
              closeTemplatesModal();
            }
          });
          
          async function openTemplatesModal() {
            const modal = document.getElementById('templates-modal');
            modal.classList.add('show');
            
            // Load templates if not already loaded
            if (!templatesData) {
              await loadTemplates();
            }
          }
          
          function closeTemplatesModal() {
            const modal = document.getElementById('templates-modal');
            modal.classList.remove('show');
            resetCreateSiteForm();
          }
          
          async function loadTemplates() {
            try {
              const response = await fetch('/api/templates');
              const result = await response.json();
              
              if (result.success) {
                templatesData = result.data;
                renderTemplates();
              } else {
                showTemplateError('Failed to load templates: ' + result.error);
              }
            } catch (error) {
              console.error('Error loading templates:', error);
              showTemplateError('Error loading templates');
            }
          }
          
          function renderTemplates(category = 'all') {
            const container = document.getElementById('templates-grid');
            
            if (!templatesData) {
              container.innerHTML = '<div class="template-loading">Failed to load templates</div>';
              return;
            }
            
            const templates = category === 'all' 
              ? templatesData.templates 
              : templatesData.templates.filter(t => t.category === category);
            
            container.innerHTML = templates.map(template => \`
              <div class="template-card" onclick="selectTemplate('\${template.id}')">
                <div class="template-header">
                  <h3 class="template-name">\${template.name}</h3>
                  <span class="template-category">\${template.category}</span>
                </div>
                <p class="template-description">\${template.description}</p>
                <div class="template-tags">
                  \${template.tags.map(tag => \`<span class="template-tag">\${tag}</span>\`).join('')}
                </div>
              </div>
            \`).join('');
          }
          
          function switchTemplateCategory(category) {
            // Update active tab
            document.querySelectorAll('.templates-category-tab').forEach(tab => {
              if (tab.dataset.category === category) {
                tab.classList.add('active');
              } else {
                tab.classList.remove('active');
              }
            });
            
            // Re-render templates
            renderTemplates(category);
          }
          
          function selectTemplate(templateId) {
            const template = templatesData.templates.find(t => t.id === templateId);
            if (!template) return;
            
            selectedTemplate = template;
            
            // Update UI to show selected template
            document.querySelectorAll('.template-card').forEach(card => {
              card.classList.remove('selected');
            });
            
            event.target.closest('.template-card').classList.add('selected');
            
            // Show creation form
            document.getElementById('selected-template-name').textContent = template.name;
            document.getElementById('selected-template-description').textContent = template.description;
            document.getElementById('create-site-form').style.display = 'block';
            
            // Generate suggested site name
            const suggestedName = generateSiteName(template.name);
            document.getElementById('site-name-input').value = suggestedName;
          }
          
          function generateSiteName(templateName) {
            // Convert template name to valid site name
            const baseName = templateName
              .toLowerCase()
              .replace(/[^a-z0-9\\s-]/g, '')
              .replace(/\\s+/g, '-')
              .replace(/^-+|-+$/g, '');
            
            return 'my-' + baseName;
          }
          
          function resetCreateSiteForm() {
            selectedTemplate = null;
            document.getElementById('create-site-form').style.display = 'none';
            document.getElementById('creation-progress').style.display = 'none';
            document.getElementById('site-name-input').value = '';
            
            // Clear selection
            document.querySelectorAll('.template-card').forEach(card => {
              card.classList.remove('selected');
            });
          }
          
          function cancelSiteCreation() {
            resetCreateSiteForm();
          }
          
          async function createSiteFromTemplate() {
            if (!selectedTemplate) {
              alert('Please select a template first');
              return;
            }
            
            const siteName = document.getElementById('site-name-input').value.trim();
            
            if (!siteName) {
              alert('Please enter a site name');
              return;
            }
            
            if (!/^[a-zA-Z0-9-]+$/.test(siteName)) {
              alert('Site name can only contain letters, numbers, and hyphens');
              return;
            }
            
            // Show progress
            const progressDiv = document.getElementById('creation-progress');
            const progressFill = document.querySelector('.progress-fill');
            const progressText = document.getElementById('progress-text');
            
            progressDiv.style.display = 'block';
            progressText.textContent = 'Creating your site...';
            progressFill.style.width = '10%';
            
            // Disable form
            document.getElementById('create-site-btn').disabled = true;
            document.getElementById('cancel-create-btn').disabled = true;
            document.getElementById('site-name-input').disabled = true;
            
            try {
              // Animate progress
              let progress = 10;
              const progressInterval = setInterval(() => {
                progress += Math.random() * 20;
                if (progress > 90) progress = 90;
                progressFill.style.width = progress + '%';
              }, 500);
              
              const response = await fetch('/api/templates/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  templateId: selectedTemplate.id,
                  siteName: siteName
                })
              });
              
              const result = await response.json();
              
              clearInterval(progressInterval);
              progressFill.style.width = '100%';
              
              if (result.success) {
                progressText.textContent = 'Site created successfully! Redirecting...';
                
                setTimeout(() => {
                  // Redirect to the new site's editor
                  window.location.href = '/editor/' + siteName;
                }, 1500);
              } else {
                progressDiv.style.display = 'none';
                alert('Failed to create site: ' + result.error);
                console.error('Creation output:', result.output);
              }
            } catch (error) {
              console.error('Error creating site:', error);
              progressDiv.style.display = 'none';
              alert('Error creating site: ' + error.message);
            } finally {
              // Re-enable form
              document.getElementById('create-site-btn').disabled = false;
              document.getElementById('cancel-create-btn').disabled = false;
              document.getElementById('site-name-input').disabled = false;
            }
          }
          
          function showTemplateError(message) {
            const container = document.getElementById('templates-grid');
            container.innerHTML = \`<div class="template-loading">ERROR: \${message}</div>\`;
          }
          
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