import { Hono } from 'hono';
import { requireAdmin } from './auth';
import { UserModel } from '@core/database/models/user';
import { Database } from '@core/database/database';
import type { AdminContext, AppContext } from '@core/types';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Type definitions for site data
interface LegacySiteData {
  site: string;
  status: string;
  type: string;
  cwd: string;
  port?: number;
}

interface NewSiteData {
  name: string;
  domain: string;
  path: string;
  status: string;
  template: string;
}

type SiteData = LegacySiteData | NewSiteData;

// Type guard functions
function isLegacySite(site: SiteData): site is LegacySiteData {
  return 'site' in site;
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const userModel = new UserModel();
const userRoutes = new Hono<AppContext>();

// Apply admin authentication to all user routes
userRoutes.use('*', requireAdmin);

// User list page
userRoutes.get('/', async (c) => {
  const user = c.get('user');
  const page = parseInt(c.req.query('page') || '1');
  const limit = 20;
  const offset = (page - 1) * limit;
  
  try {
    const users = userModel.getAllUsers(offset, limit);
    const totalUsers = userModel.getUserCount();
    const totalPages = Math.ceil(totalUsers / limit);
    
    // Get user stats for each user
    const usersWithStats = users.map(u => {
      const stats = userModel.getUserStats(u.id);
      return { ...u, ...stats };
    });
    
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Users - Admin Panel</title>
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
                <a href="/users" class="nav-link active">Users (${totalUsers})</a>
              </li>
              <li class="nav-item">
                <a href="/users/sites" class="nav-link">Sites</a>
              </li>
              <li class="nav-item">
                <a href="/settings" class="nav-link">Settings</a>
              </li>
            </ul>
          </nav>
          
          <main class="admin-main">
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">Users (${totalUsers})</h2>
                <div class="panel-actions">
                  <a href="/users/create" class="btn success">+ New User</a>
                </div>
              </div>
              
              <div class="table-container">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Sites</th>
                      <th>Resources</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${usersWithStats.map(u => `
                      <tr>
                        <td>
                          <strong>${u.username}</strong>
                          ${u.id === user.id ? ' <em>(you)</em>' : ''}
                        </td>
                        <td>${u.email}</td>
                        <td>
                          <span class="status-badge ${u.is_admin ? 'admin' : 'user'}">
                            ${u.is_admin ? 'Admin' : 'User'}
                          </span>
                        </td>
                        <td>
                          <span class="status-badge ${u.is_active ? 'active' : 'inactive'}">
                            ${u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          ${u.site_count}/${u.max_sites}
                          ${u.site_count >= u.max_sites ? ' <span style="color: var(--accent-red);">MAX</span>' : ''}
                        </td>
                        <td>
                          <div style="font-size: 0.8rem; color: var(--text-secondary);">
                            RAM: ${u.total_memory_usage}/${u.max_memory_mb}MB<br>
                            CPU: ${u.total_cpu_usage.toFixed(1)}/${u.max_cpu_cores} cores
                          </div>
                        </td>
                        <td style="font-size: 0.8rem; color: var(--text-secondary);">
                          ${new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td>
                          <div style="display: flex; gap: 0.5rem;">
                            <a href="/users/${u.id}/edit" class="btn small">Edit</a>
                            <a href="/users/${u.id}/sites" class="btn small">Sites</a>
                            ${u.id !== user.id ? `
                              <form method="POST" action="/users/${u.id}/toggle-status" style="display: inline;">
                                <button type="submit" class="btn small ${u.is_active ? 'danger' : 'success'}">
                                  ${u.is_active ? 'Disable' : 'Enable'}
                                </button>
                              </form>
                            ` : ''}
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                    
                    ${usersWithStats.length === 0 ? `
                      <tr>
                        <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                          No users found.
                        </td>
                      </tr>
                    ` : ''}
                  </tbody>
                </table>
              </div>
              
              ${totalPages > 1 ? `
                <div style="display: flex; justify-content: center; gap: 0.5rem; margin-top: 1rem;">
                  ${page > 1 ? `<a href="/users?page=${page - 1}" class="btn small">← Previous</a>` : ''}
                  <span class="btn small" style="background: var(--accent-blue); color: white;">${page} / ${totalPages}</span>
                  ${page < totalPages ? `<a href="/users?page=${page + 1}" class="btn small">Next →</a>` : ''}
                </div>
              ` : ''}
            </div>
          </main>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Users page error:', error);
    return c.html(`
      <div class="message error">
        Error loading users: ${error}
      </div>
    `);
  }
});

// Create user page
userRoutes.get('/create', async (c) => {
  const user = c.get('user');
  const error = c.req.query('error');
  const success = c.req.query('success');
  
  // Get default limits from settings
  const db = Database.getInstance();
  const settings = db.query<{ key: string; value: string }>(
    `SELECT key, value FROM system_settings WHERE key IN (?, ?, ?, ?)`,
    ['default_max_sites', 'default_max_memory', 'default_max_cpu', 'default_max_storage']
  );
  
  const defaults = {
    max_sites: 3,
    max_memory: 512,
    max_cpu: 0.5,
    max_storage: 1024
  };
  
  for (const setting of settings) {
    switch (setting.key) {
      case 'default_max_sites':
        defaults.max_sites = parseInt(setting.value) || 3;
        break;
      case 'default_max_memory':
        defaults.max_memory = parseInt(setting.value) || 512;
        break;
      case 'default_max_cpu':
        defaults.max_cpu = parseFloat(setting.value) || 0.5;
        break;
      case 'default_max_storage':
        defaults.max_storage = parseInt(setting.value) || 1024;
        break;
    }
  }
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Create User - Admin Panel</title>
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
              <a href="/users" class="nav-link active">Users</a>
            </li>
            <li class="nav-item">
              <a href="/users/sites" class="nav-link">Sites</a>
            </li>
            <li class="nav-item">
              <a href="/settings" class="nav-link">Settings</a>
            </li>
          </ul>
        </nav>
        
        <main class="admin-main">
          <div class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Create New User</h2>
              <div class="panel-actions">
                <a href="/users" class="btn">← Back to Users</a>
              </div>
            </div>
            
            ${error ? `<div class="message error">${error}</div>` : ''}
            ${success ? `<div class="message success">${success}</div>` : ''}
            
            <form method="POST" action="/users/create" style="max-width: 600px;">
              <div class="form-group">
                <label class="form-label" for="username">Username *</label>
                <input 
                  type="text" 
                  id="username" 
                  name="username" 
                  class="form-input" 
                  required
                  pattern="[a-zA-Z0-9_-]+"
                  minlength="3"
                  maxlength="50"
                  placeholder="user123"
                >
                <small style="color: var(--text-secondary); font-size: 0.8rem;">
                  3-50 characters, letters, numbers, hyphens, and underscores only
                </small>
              </div>
              
              <div class="form-group">
                <label class="form-label" for="email">Email *</label>
                <input 
                  type="email" 
                  id="email" 
                  name="email" 
                  class="form-input" 
                  required
                  placeholder="user@example.com"
                >
              </div>
              
              <div class="form-group">
                <label class="form-label" for="password">Password *</label>
                <input 
                  type="password" 
                  id="password" 
                  name="password" 
                  class="form-input" 
                  required
                  minlength="8"
                  placeholder="••••••••••••"
                >
                <small style="color: var(--text-secondary); font-size: 0.8rem;">
                  Minimum 8 characters, must include uppercase, lowercase, and number
                </small>
              </div>
              
              <div class="form-group">
                <label class="form-label">
                  <input type="checkbox" name="is_admin" value="1"> 
                  Grant admin privileges
                </label>
                <small style="color: var(--text-secondary); font-size: 0.8rem; display: block; margin-top: 0.5rem;">
                  Admin users can manage other users and system settings
                </small>
              </div>
              
              <h3 style="color: var(--accent-blue); margin: 2rem 0 1rem 0;">Resource Limits</h3>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                  <label class="form-label" for="max_sites">Max Sites</label>
                  <input 
                    type="number" 
                    id="max_sites" 
                    name="max_sites" 
                    class="form-input" 
                    min="1"
                    max="999"
                    value="${defaults.max_sites}"
                  >
                </div>
                
                <div class="form-group">
                  <label class="form-label" for="max_memory_mb">Max Memory (MB)</label>
                  <input 
                    type="number" 
                    id="max_memory_mb" 
                    name="max_memory_mb" 
                    class="form-input" 
                    min="128"
                    max="8192"
                    step="128"
                    value="${defaults.max_memory}"
                  >
                </div>
                
                <div class="form-group">
                  <label class="form-label" for="max_cpu_cores">Max CPU Cores</label>
                  <input 
                    type="number" 
                    id="max_cpu_cores" 
                    name="max_cpu_cores" 
                    class="form-input" 
                    min="0.1"
                    max="4.0"
                    step="0.1"
                    value="${defaults.max_cpu}"
                  >
                </div>
                
                <div class="form-group">
                  <label class="form-label" for="max_storage_mb">Max Storage (MB)</label>
                  <input 
                    type="number" 
                    id="max_storage_mb" 
                    name="max_storage_mb" 
                    class="form-input" 
                    min="256"
                    max="16384"
                    step="256"
                    value="${defaults.max_storage}"
                  >
                </div>
              </div>
              
              <div class="form-group" style="margin-top: 2rem;">
                <button type="submit" class="btn success">Create User</button>
                <a href="/users" class="btn" style="margin-left: 0.5rem;">Cancel</a>
              </div>
            </form>
          </div>
        </main>
      </div>
    </body>
    </html>
  `);
});

// Handle user creation
userRoutes.post('/create', async (c) => {
  const formData = await c.req.parseBody();
  
  try {
    const userData = {
      username: formData.username as string,
      email: formData.email as string,
      password: formData.password as string,
      is_admin: formData.is_admin === '1',
      max_sites: parseInt(formData.max_sites as string) || 3,
      max_memory_mb: parseInt(formData.max_memory_mb as string) || 512,
      max_cpu_cores: parseFloat(formData.max_cpu_cores as string) || 0.5,
      max_storage_mb: parseInt(formData.max_storage_mb as string) || 1024,
    };
    
    const userId = await userModel.createUser(userData);
    
    return c.redirect(`/users/create?success=User ${userData.username} created successfully (ID: ${userId})`);
    
  } catch (error) {
    console.error('User creation error:', error);
    return c.redirect(`/users/create?error=${encodeURIComponent((error as Error).message)}`);
  }
});

// Sites listing page
userRoutes.get('/sites', async (c) => {
  const user = c.get('user');
  
  try {
    const db = Database.getInstance();
    
    // Get all sites from both old processes table and new sites table
    const processes = db.query<{
      id: string;
      site: string;
      port: number;
      status: string;
      type: string;
      script: string;
      cwd: string;
      startTime: number;
    }>(`SELECT * FROM processes ORDER BY startTime DESC`);
    
    const sites = db.query<{
      id: number;
      user_id: number;
      name: string;
      domain: string;
      template: string;
      path: string;
      status: string;
      created_at: string;
      last_deployed: string;
      username: string;
    }>(`
      SELECT s.*, u.username 
      FROM sites s 
      JOIN users u ON s.user_id = u.id 
      ORDER BY s.created_at DESC
    `);
    
    const totalSites = processes.length + sites.length;
    
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>All Sites - Admin Panel</title>
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
                <a href="/users/sites" class="nav-link active">Sites (${totalSites})</a>
              </li>
              <li class="nav-item">
                <a href="/settings" class="nav-link">Settings</a>
              </li>
            </ul>
          </nav>
          
          <main class="admin-main">
            ${processes.length > 0 ? `
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">🏠 Legacy Sites (${processes.length})</h2>
                <div class="panel-actions">
                  <span class="btn small" style="background: var(--accent-yellow); color: white;">Legacy Process-Based</span>
                </div>
              </div>
              
              <div class="table-container">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Site Name</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Port</th>
                      <th>Path</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${processes.map(p => `
                      <tr>
                        <td>
                          <strong>${p.site}</strong>
                          <div style="font-size: 0.8rem; color: var(--text-secondary);">
                            ${p.site}.yourdomain
                          </div>
                        </td>
                        <td>
                          <span class="status-badge info">${p.type}</span>
                        </td>
                        <td>
                          <span class="status-badge ${p.status === 'running' ? 'running' : 'stopped'}">
                            ${p.status}
                          </span>
                        </td>
                        <td>:${p.port}</td>
                        <td style="font-size: 0.8rem; color: var(--text-secondary);">
                          ${p.cwd}
                        </td>
                        <td>
                          <div style="display: flex; gap: 0.5rem;">
                            <a href="/users/sites/${p.id}/manage" class="btn small success">Manage</a>
                            ${p.status === 'running' ? `
                              <form method="POST" action="/users/sites/${p.id}/restart" style="display: inline;">
                                <button type="submit" class="btn small primary">Restart</button>
                              </form>
                            ` : `
                              <form method="POST" action="/users/sites/${p.id}/start" style="display: inline;">
                                <button type="submit" class="btn small success">Start</button>
                              </form>
                            `}
                            <form method="POST" action="/users/sites/${p.id}/stop" style="display: inline;">
                              <button type="submit" class="btn small danger">Stop</button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
            ` : ''}
            
            ${sites.length > 0 ? `
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">🚀 User Sites (${sites.length})</h2>
                <div class="panel-actions">
                  <span class="btn small" style="background: var(--accent-cyan); color: white;">Container-Based</span>
                </div>
              </div>
              
              <div class="table-container">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Site Name</th>
                      <th>Owner</th>
                      <th>Template</th>
                      <th>Status</th>
                      <th>Domain</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${sites.map(s => `
                      <tr>
                        <td>
                          <strong>${s.name}</strong>
                        </td>
                        <td>
                          <span style="color: var(--accent-blue);">${s.username}</span>
                        </td>
                        <td>
                          <span class="status-badge user">${s.template}</span>
                        </td>
                        <td>
                          ${(s.template === 'static' || s.template === 'static-build' || s.template === 'astro' || s.template === 'nextjs' || s.template === 'vite') ? 
                            '<span class="status-badge running">always running</span>' :
                            `<span class="status-badge ${s.status === 'running' ? 'running' : 'stopped'}">
                              ${s.status}
                            </span>`
                          }
                        </td>
                        <td style="font-size: 0.8rem; color: var(--text-secondary);">
                          ${s.domain}
                        </td>
                        <td style="font-size: 0.8rem; color: var(--text-secondary);">
                          ${new Date(s.created_at).toLocaleDateString()}
                        </td>
                        <td>
                          <div style="display: flex; gap: 0.5rem;">
                            <a href="/users/sites/${s.id}/manage" class="btn small success">Manage</a>
                            <form method="POST" action="/users/sites/${s.id}/restart" style="display: inline;">
                              <button type="submit" class="btn small primary">Restart</button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
            ` : ''}
            
            ${totalSites === 0 ? `
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">No Sites Found</h2>
              </div>
              
              <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <p>No sites have been deployed yet.</p>
                <p style="margin-top: 1rem;">Users can create sites through the editor interface.</p>
              </div>
            </div>
            ` : ''}
          </main>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Sites page error:', error);
    return c.html(`
      <div class="message error">
        Error loading sites: ${error}
      </div>
    `);
  }
});

// Individual site management page
userRoutes.get('/sites/:id/manage', async (c) => {
  const siteId = c.req.param('id');
  const user = c.get('user');
  
  try {
    const db = Database.getInstance();
    
    // Try to find in processes first (legacy sites)
    let siteData = null;
    let isLegacy = false;
    
    const process = db.query<{
      id: string;
      site: string;
      port: number;
      status: string;
      type: string;
      script: string;
      cwd: string;
      startTime: number;
    }>(`SELECT * FROM processes WHERE id = ?`, [siteId]);
    
    if (process.length > 0) {
      siteData = process[0];
      isLegacy = true;
    } else {
      // Check in sites table
      const sites = db.query<{
        id: number;
        user_id: number;
        name: string;
        domain: string;
        template: string;
        path: string;
        status: string;
        created_at: string;
        username: string;
      }>(`
        SELECT s.*, u.username 
        FROM sites s 
        JOIN users u ON s.user_id = u.id 
        WHERE s.id = ?
      `, [parseInt(siteId)]);
      
      if (sites.length > 0) {
        siteData = sites[0];
      }
    }
    
    if (!siteData) {
      return c.redirect('/users/sites?error=Site not found');
    }
    
    // Read package.json if it exists to get available scripts
    const fs = require('fs');
    const path = require('path');
    let packageJsonPath;
    let packageScripts = {};
    
    if (isLegacy) {
      packageJsonPath = path.join(isLegacySite(siteData) ? siteData.cwd : siteData.path, 'package.json');
    } else {
      packageJsonPath = path.join('/Users/keith/projects/deploy', isLegacySite(siteData) ? siteData.cwd : siteData.path, 'package.json');
    }
    
    try {
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        packageScripts = packageJson.scripts || {};
      }
    } catch (error) {
      console.error('Error reading package.json:', error);
    }
    
    const siteName = isLegacy ? (siteData as LegacySiteData).site : (siteData as NewSiteData).name;
    const siteStatus = siteData.status;
    const siteType = isLegacy ? (siteData as LegacySiteData).type : (siteData as NewSiteData).template;
    const sitePath = isLegacy ? (siteData as LegacySiteData).cwd : (siteData as NewSiteData).path;
    
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Manage ${siteName} - Admin Panel</title>
        <link rel="stylesheet" href="/static/admin.css">
        <script>
          async function runScript(script, event) {
            const button = event.target;
            const output = document.getElementById('script-output');
            
            button.disabled = true;
            button.textContent = 'Running...';
            output.innerHTML = '<div style="color: var(--accent-blue);">Running ' + script + '...</div>';
            
            try {
              const response = await fetch('/users/sites/${siteId}/run-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script: script })
              });
              
              const result = await response.text();
              // Escape HTML characters to prevent display issues
              const escapedResult = result
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
              output.innerHTML = '<pre style="white-space: pre-wrap; font-size: 0.8rem;">' + escapedResult + '</pre>';
            } catch (error) {
              output.innerHTML = '<div style="color: var(--accent-red);">Error: ' + (error as Error).message + '</div>';
            } finally {
              button.disabled = false;
              button.textContent = 'Run ' + script;
            }
          }
        </script>
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
                <a href="/users/sites" class="nav-link active">Sites</a>
              </li>
              <li class="nav-item">
                <a href="/settings" class="nav-link">Settings</a>
              </li>
            </ul>
          </nav>
          
          <main class="admin-main">
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">🚀 ${siteName}</h2>
                <div class="panel-actions">
                  <a href="/users/sites" class="btn">← Back to Sites</a>
                </div>
              </div>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
                <div>
                  <h3 style="color: var(--accent-blue); margin-bottom: 1rem;">Site Information</h3>
                  <div class="activity-log">
                    <div class="activity-item">
                      <span class="activity-action">Name:</span>
                      <span style="color: var(--accent-purple);">${siteName}</span>
                    </div>
                    <div class="activity-item">
                      <span class="activity-action">Type:</span>
                      <span class="status-badge info">${siteType}</span>
                    </div>
                    <div class="activity-item">
                      <span class="activity-action">Status:</span>
                      ${(siteType === 'static' || siteType === 'static-build' || siteType === 'astro' || siteType === 'nextjs' || siteType === 'vite') ? 
                        '<span class="status-badge running">always running</span>' :
                        `<span class="status-badge ${siteStatus === 'running' ? 'running' : 'stopped'}">
                          ${siteStatus}
                        </span>`
                      }
                    </div>
                    ${isLegacy ? `
                    <div class="activity-item">
                      <span class="activity-action">Port:</span>
                      <span style="color: var(--accent-blue);">:${isLegacySite(siteData) ? siteData.port || 3000 : 3000}</span>
                    </div>
                    ` : `
                    <div class="activity-item">
                      <span class="activity-action">Domain:</span>
                      <span style="color: var(--accent-blue);">${isLegacySite(siteData) ? siteData.site : (siteData as NewSiteData).domain}</span>
                    </div>
                    `}
                    <div class="activity-item">
                      <span class="activity-action">Path:</span>
                      <span style="color: var(--text-secondary); font-size: 0.8rem;">${sitePath}</span>
                    </div>
                    ${isLegacy ? `
                    <div class="activity-item">
                      <span class="activity-action">Mode:</span>
                      <span class="status-badge warning">Legacy Process</span>
                    </div>
                    ` : `
                    <div class="activity-item">
                      <span class="activity-action">Mode:</span>
                      <span class="status-badge success">Container-Based</span>
                    </div>
                    `}
                  </div>
                </div>
                
                <div>
                  <h3 style="color: var(--accent-blue); margin-bottom: 1rem;">Quick Actions</h3>
                  <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    ${siteStatus === 'running' ? `
                      <form method="POST" action="/users/sites/${siteId}/restart">
                        <button type="submit" class="btn primary" style="width: 100%;">🔄 Restart Site</button>
                      </form>
                      <form method="POST" action="/users/sites/${siteId}/stop">
                        <button type="submit" class="btn danger" style="width: 100%;">⏹️ Stop Site</button>
                      </form>
                    ` : `
                      <form method="POST" action="/users/sites/${siteId}/start">
                        <button type="submit" class="btn success" style="width: 100%;">▶️ Start Site</button>
                      </form>
                    `}
                    
                    <a href="http://${isLegacy ? (siteData as LegacySiteData).site + '.yourdomain' : (siteData as NewSiteData).domain}" target="_blank" class="btn" style="width: 100%; text-align: center;">
                      🌐 View Site
                    </a>
                  </div>
                </div>
              </div>
            </div>
            
            ${Object.keys(packageScripts).length > 0 ? `
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">📦 Package Scripts</h2>
              </div>
              
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                ${Object.keys(packageScripts).map(script => {
                  const escapedScript = script.replace(/'/g, "\\'");
                  const scriptCommand = (packageScripts as Record<string, string>)[script] || '';
                  const escapedCommand = scriptCommand.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                  return `
                  <button 
                    onclick="runScript('${escapedScript}', event)" 
                    class="btn success"
                    style="text-align: left;"
                  >
                    <strong>npm run ${script}</strong>
                    <div style="font-size: 0.8rem; opacity: 0.8; margin-top: 0.25rem;">
                      ${escapedCommand}
                    </div>
                  </button>
                `;}).join('')}
              </div>
              
              <div>
                <h3 style="color: var(--accent-blue); margin-bottom: 1rem;">Script Output</h3>
                <div id="script-output" class="activity-log" style="min-height: 200px; background: var(--bg-dark);">
                  <div style="color: var(--text-secondary);">Click a script above to see output here...</div>
                </div>
              </div>
            </div>
            ` : ''}
            
            ${Object.keys(packageScripts).length === 0 ? `
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">📦 No Package Scripts Found</h2>
              </div>
              <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <p>No package.json scripts found for this site.</p>
                <p>Add scripts to package.json to manage this site from here.</p>
              </div>
            </div>
            ` : ''}
          </main>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Site management error:', error);
    return c.redirect('/users/sites?error=' + encodeURIComponent((error as Error).message));
  }
});

// Script execution endpoint
userRoutes.post('/sites/:id/run-script', async (c) => {
  const siteId = c.req.param('id');
  const { script } = await c.req.json();
  
  try {
    const db = Database.getInstance();
    
    // Find the site (legacy or new)
    let sitePath = null;
    let isLegacy = false;
    
    const processResult = db.query<{ cwd: string }>(`SELECT cwd FROM processes WHERE id = ?`, [siteId]);
    if (processResult.length > 0) {
      sitePath = processResult[0]?.cwd || '';
      isLegacy = true;
    } else {
      const sites = db.query<{ path: string }>(`SELECT path FROM sites WHERE id = ?`, [parseInt(siteId)]);
      if (sites.length > 0) {
        sitePath = `/Users/keith/projects/deploy/${sites[0]?.path || ''}`;
      }
    }
    
    if (!sitePath) {
      return c.json({ error: 'Site not found' }, 404);
    }
    
    // Execute the npm script
    const { spawn } = require('child_process');
    const childProcess = spawn('npm', ['run', script], {
      cwd: sitePath,
      shell: true
    });
    
    let output = '';
    let errorOutput = '';
    
    return new Promise((resolve) => {
      childProcess.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      childProcess.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      childProcess.on('close', (code: number | null) => {
        const result = `$ npm run ${script}\n\n${output}${errorOutput ? '\nErrors:\n' + errorOutput : ''}\n\nProcess exited with code: ${code}`;
        resolve(c.text(result));
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        childProcess.kill();
        resolve(c.text(`$ npm run ${script}\n\nTimeout: Process killed after 30 seconds`));
      }, 30000);
    });
    
  } catch (error) {
    console.error('Script execution error:', error);
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Site restart handler
userRoutes.post('/sites/:id/restart', async (c) => {
  const siteId = c.req.param('id');
  // TODO: Implement actual site restart logic
  // For now, just redirect back with a message
  return c.redirect(`/users/sites/${siteId}/manage?success=Site restart triggered`);
});

// Site start handler
userRoutes.post('/sites/:id/start', async (c) => {
  const siteId = c.req.param('id');
  // TODO: Implement actual site start logic
  return c.redirect(`/users/sites/${siteId}/manage?success=Site start triggered`);
});

// Site stop handler
userRoutes.post('/sites/:id/stop', async (c) => {
  const siteId = c.req.param('id');
  // TODO: Implement actual site stop logic
  return c.redirect(`/users/sites/${siteId}/manage?success=Site stop triggered`);
});

// Unclaimed Projects page
userRoutes.get('/projects/unclaimed', async (c) => {
  const user = c.get('user');
  
  try {
    const fs = require('fs');
    const path = require('path');
    const db = Database.getInstance();
    
    // Get all directories in /sites
    const sitesDir = '/Users/keith/projects/deploy/sites';
    const directories = fs.readdirSync(sitesDir).filter((item: string) => {
      const itemPath = path.join(sitesDir, item);
      return fs.statSync(itemPath).isDirectory();
    });
    
    // Get already claimed sites
    const claimedProcesses = db.query<{ site: string }>(`SELECT DISTINCT site FROM processes`);
    const claimedSites = db.query<{ name: string }>(`SELECT DISTINCT name FROM sites`);
    const claimedNames = [
      ...claimedProcesses.map((p: any) => p.site),
      ...claimedSites.map((s: any) => s.name)
    ];
    
    // Find unclaimed directories
    const unclaimedProjects = directories
      .filter((dir: string) => !claimedNames.includes(dir))
      .map((dir: string) => {
        const projectPath = path.join(sitesDir, dir);
        let hasPackageJson = false;
        let packageInfo = null;
        
        try {
          const packageJsonPath = path.join(projectPath, 'package.json');
          if (fs.existsSync(packageJsonPath)) {
            hasPackageJson = true;
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            packageInfo = {
              name: packageJson.name,
              description: packageJson.description,
              scripts: Object.keys(packageJson.scripts || {}),
              dependencies: Object.keys(packageJson.dependencies || {}),
            };
          }
        } catch (error) {
          console.error(`Error reading package.json for ${dir}:`, error);
        }
        
        // Check for common files to determine type
        const files = fs.readdirSync(projectPath);
        let projectType = 'unknown';
        
        if (files.includes('astro.config.mjs') || files.includes('astro.config.js')) {
          projectType = 'astro';
        } else if (files.includes('next.config.js') || files.includes('next.config.ts')) {
          projectType = 'nextjs';
        } else if (hasPackageJson) {
          projectType = 'node';
        } else if (files.includes('index.html')) {
          projectType = 'static';
        }
        
        return {
          name: dir,
          path: projectPath,
          type: projectType,
          hasPackageJson,
          packageInfo,
          files: files.length
        };
      });
    
    // Get all users for assignment dropdown
    const users = userModel.getAllUsers();
    
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Unclaimed Projects - Admin Panel</title>
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
                <a href="/users/projects/unclaimed" class="nav-link active">Unclaimed (${unclaimedProjects.length})</a>
              </li>
              <li class="nav-item">
                <a href="/settings" class="nav-link">Settings</a>
              </li>
            </ul>
          </nav>
          
          <main class="admin-main">
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">📁 Unclaimed Projects (${unclaimedProjects.length})</h2>
                <div class="panel-actions">
                  <span class="btn small" style="background: var(--accent-purple); color: white;">Found in /sites</span>
                </div>
              </div>
              
              <div style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-dark); border-radius: 8px;">
                <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">
                  💡 These are projects found in the <code>/sites</code> directory that haven't been assigned to any user yet.
                </p>
                <p style="color: var(--text-secondary);">
                  Assign them to users to make them manageable through the admin panel.
                </p>
              </div>
              
              ${unclaimedProjects.length > 0 ? `
              <div class="table-container">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Project Name</th>
                      <th>Type</th>
                      <th>Info</th>
                      <th>Files</th>
                      <th>Assign To</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${unclaimedProjects.map((project: any) => `
                      <tr>
                        <td>
                          <strong>${project.name}</strong>
                          ${project.packageInfo?.description ? `
                            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">
                              ${project.packageInfo.description}
                            </div>
                          ` : ''}
                        </td>
                        <td>
                          <span class="status-badge ${project.type === 'astro' ? 'success' : project.type === 'nextjs' ? 'primary' : project.type === 'node' ? 'info' : 'user'}">${project.type}</span>
                        </td>
                        <td style="font-size: 0.8rem;">
                          ${project.hasPackageJson ? `
                            <div>📦 ${project.packageInfo?.name || 'package.json'}</div>
                            ${project.packageInfo?.scripts?.length > 0 ? `
                              <div style="color: var(--accent-green);">🔧 ${project.packageInfo.scripts.length} scripts</div>
                            ` : ''}
                            ${project.packageInfo?.dependencies?.length > 0 ? `
                              <div style="color: var(--text-secondary);">📚 ${project.packageInfo.dependencies.length} deps</div>
                            ` : ''}
                          ` : `
                            <div style="color: var(--text-secondary);">No package.json</div>
                          `}
                        </td>
                        <td style="color: var(--text-secondary);">
                          ${project.files} files
                        </td>
                        <td>
                          <form method="POST" action="/users/projects/claim" style="display: flex; align-items: center; gap: 0.5rem;">
                            <input type="hidden" name="project" value="${project.name}">
                            <select name="user_id" class="form-select" style="font-size: 0.8rem; padding: 0.25rem;">
                              <option value="">Select user...</option>
                              ${users.map(u => `
                                <option value="${u.id}" ${u.is_admin ? 'selected' : ''}>${u.username} ${u.is_admin ? '(admin)' : ''}</option>
                              `).join('')}
                            </select>
                            <button type="submit" class="btn small success">Claim</button>
                          </form>
                        </td>
                        <td>
                          <div style="display: flex; gap: 0.5rem;">
                            <a href="/users/projects/${project.name}/preview" class="btn small" target="_blank">👁️ Preview</a>
                            <form method="POST" action="/users/projects/delete" style="display: inline;">
                              <input type="hidden" name="project" value="${project.name}">
                              <button type="submit" class="btn small danger" onclick="return confirm('Are you sure? This will delete the project files.')">🗑️ Delete</button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              ` : `
              <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <h3 style="color: var(--accent-green); margin-bottom: 1rem;">🎉 All Projects Claimed!</h3>
                <p>All projects in the <code>/sites</code> directory have been assigned to users.</p>
                <p style="margin-top: 1rem;">New projects will appear here automatically when added to the file system.</p>
              </div>
              `}
            </div>
          </main>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Unclaimed projects error:', error);
    return c.html(`
      <div class="message error">
        Error loading unclaimed projects: ${error}
      </div>
    `);
  }
});

// Claim project handler
userRoutes.post('/projects/claim', async (c) => {
  const formData = await c.req.parseBody();
  const projectName = formData.project as string;
  const userId = parseInt(formData.user_id as string);
  
  if (!projectName || !userId) {
    return c.redirect('/users/projects/unclaimed?error=Project name and user required');
  }
  
  try {
    const db = Database.getInstance();
    
    // Create a site entry for the claimed project
    db.run(`
      INSERT INTO sites (user_id, name, domain, template, path, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      userId,
      projectName,
      `${projectName}.yourdomain`,
      'static', // Default template, can be updated later
      `sites/${projectName}`,
      'stopped'
    ]);
    
    const user = userModel.getUserById(userId);
    return c.redirect(`/users/projects/unclaimed?success=Project "${projectName}" claimed by ${user?.username}`);
    
  } catch (error) {
    console.error('Claim project error:', error);
    return c.redirect(`/users/projects/unclaimed?error=${encodeURIComponent((error as Error).message)}`);
  }
});

// Project preview handler
userRoutes.get('/projects/:name/preview', async (c) => {
  const projectName = c.req.param('name');
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    const projectPath = path.join('/Users/keith/projects/deploy/sites', projectName);
    
    // Check if project exists
    if (!fs.existsSync(projectPath)) {
      return c.html(`
        <div class="message error">
          Project "${projectName}" not found.
        </div>
      `);
    }
    
    // Get basic project info
    const files = fs.readdirSync(projectPath);
    let packageInfo = null;
    let readmeContent = null;
    
    // Try to read package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        packageInfo = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      } catch (error) {
        console.error('Error reading package.json:', error);
      }
    }
    
    // Try to read README
    const readmePaths = ['README.md', 'readme.md', 'README.txt', 'readme.txt'];
    for (const readmePath of readmePaths) {
      const fullReadmePath = path.join(projectPath, readmePath);
      if (fs.existsSync(fullReadmePath)) {
        try {
          readmeContent = fs.readFileSync(fullReadmePath, 'utf8');
          break;
        } catch (error) {
          console.error('Error reading README:', error);
        }
      }
    }
    
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Preview ${projectName} - Admin Panel</title>
        <link rel="stylesheet" href="/static/admin.css">
        <style>
          .file-tree {
            font-family: monospace;
            font-size: 0.9rem;
            background: var(--bg-dark);
            padding: 1rem;
            border-radius: 4px;
            max-height: 300px;
            overflow-y: auto;
          }
          .readme-content {
            background: var(--bg-dark);
            padding: 1rem;
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.85rem;
            white-space: pre-wrap;
            max-height: 400px;
            overflow-y: auto;
          }
        </style>
      </head>
      <body>
        <div class="admin-container">
          <header class="admin-header">
            <div class="admin-title">Project Preview</div>
            <div class="admin-user">
              <a href="/users/projects/unclaimed" style="color: var(--accent-cyan);">← Back to Unclaimed</a>
            </div>
          </header>
          
          <main class="admin-main">
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">📁 ${projectName}</h2>
                <div class="panel-actions">
                  <span class="btn small" style="background: var(--accent-blue); color: white;">${files.length} files</span>
                </div>
              </div>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
                <div>
                  <h3 style="color: var(--accent-blue); margin-bottom: 1rem;">📦 Package Information</h3>
                  <div class="activity-log">
                    ${packageInfo ? `
                      <div class="activity-item">
                        <span class="activity-action">Name:</span>
                        <span style="color: var(--accent-purple);">${packageInfo.name || 'N/A'}</span>
                      </div>
                      <div class="activity-item">
                        <span class="activity-action">Version:</span>
                        <span style="color: var(--text-secondary);">${packageInfo.version || 'N/A'}</span>
                      </div>
                      <div class="activity-item">
                        <span class="activity-action">Description:</span>
                        <span style="color: var(--text-secondary);">${packageInfo.description || 'No description'}</span>
                      </div>
                      <div class="activity-item">
                        <span class="activity-action">Scripts:</span>
                        <span style="color: var(--accent-green);">${Object.keys(packageInfo.scripts || {}).length} defined</span>
                      </div>
                      <div class="activity-item">
                        <span class="activity-action">Dependencies:</span>
                        <span style="color: var(--accent-blue);">${Object.keys(packageInfo.dependencies || {}).length} packages</span>
                      </div>
                    ` : `
                      <div class="activity-item" style="color: var(--text-secondary);">
                        No package.json found
                      </div>
                    `}
                  </div>
                </div>
                
                <div>
                  <h3 style="color: var(--accent-blue); margin-bottom: 1rem;">📂 File Tree</h3>
                  <div class="file-tree">
                    ${files.slice(0, 20).map((file: string) => {
                      const filePath = path.join(projectPath, file);
                      const isDir = fs.statSync(filePath).isDirectory();
                      return `<div>${isDir ? '📁' : '📄'} ${file}</div>`;
                    }).join('')}
                    ${files.length > 20 ? `<div style="color: var(--text-secondary); font-style: italic;">... and ${files.length - 20} more files</div>` : ''}
                  </div>
                </div>
              </div>
            </div>
            
            ${readmeContent ? `
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">📖 README</h2>
              </div>
              
              <div class="readme-content">
                ${readmeContent.slice(0, 2000)}${readmeContent.length > 2000 ? '\n\n... (truncated)' : ''}
              </div>
            </div>
            ` : ''}
            
            ${packageInfo?.scripts && Object.keys(packageInfo.scripts).length > 0 ? `
            <div class="panel">
              <div class="panel-header">
                <h2 class="panel-title">🔧 Available Scripts</h2>
              </div>
              
              <div class="activity-log">
                ${Object.entries(packageInfo.scripts || {}).map(([script, command]: [string, unknown]) => `
                  <div class="activity-item">
                    <span class="activity-action">npm run ${script}:</span>
                    <span style="color: var(--text-secondary); font-family: monospace; font-size: 0.8rem;">${command}</span>
                  </div>
                `).join('')}
              </div>
            </div>
            ` : ''}
          </main>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Project preview error:', error);
    return c.html(`
      <div class="message error">
        Error loading project preview: ${(error as Error).message}
      </div>
    `);
  }
});

// Project deletion handler
userRoutes.post('/projects/delete', async (c) => {
  const formData = await c.req.parseBody();
  const projectName = formData.project as string;
  
  if (!projectName) {
    return c.redirect('/users/projects/unclaimed?error=Project name required');
  }
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    const projectPath = path.join('/Users/keith/projects/deploy/sites', projectName);
    
    // Check if project exists
    if (!fs.existsSync(projectPath)) {
      return c.redirect(`/users/projects/unclaimed?error=Project "${projectName}" not found`);
    }
    
    // Remove the directory recursively
    fs.rmSync(projectPath, { recursive: true, force: true });
    
    return c.redirect(`/users/projects/unclaimed?success=Project "${projectName}" has been deleted`);
    
  } catch (error) {
    console.error('Project deletion error:', error);
    return c.redirect(`/users/projects/unclaimed?error=${encodeURIComponent((error as Error).message)}`);
  }
});

// Toggle user active/inactive status
userRoutes.post('/:id/toggle-status', async (c) => {
  const userId = parseInt(c.req.param('id'));
  const currentUser = c.get('user') as any;
  
  if (userId === currentUser.id) {
    return c.redirect('/users?error=Cannot disable your own account');
  }
  
  try {
    const user = userModel.getUserById(userId);
    if (!user) {
      return c.redirect('/users?error=User not found');
    }
    
    userModel.updateUser(userId, { is_active: !user.is_active });
    
    return c.redirect(`/users?success=User ${user.username} has been ${user.is_active ? 'disabled' : 'enabled'}`);
    
  } catch (error) {
    console.error('Toggle status error:', error);
    return c.redirect(`/users?error=${encodeURIComponent((error as Error).message)}`);
  }
});

export { userRoutes };