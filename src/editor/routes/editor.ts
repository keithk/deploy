import { Hono } from 'hono';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { getCookie } from 'hono/cookie';
import { Database } from '../../core/database/database';
import { validateSession } from '../../core/auth/sessions';
import { requireAuth } from './auth';
import { getSiteUrl, isEditableFile } from '../utils/site-helpers';
import type { HonoContext, AuthenticatedUser, SiteData } from '../../types/hono';

const editorRoutes = new Hono();

// Authentication is already handled by the dashboard route
// Users must be authenticated to reach the dashboard, which is where they access the editor from
// editorRoutes.use('*', requireAuth);

// Main editor page for a site
editorRoutes.get('/:sitename', async (c: HonoContext) => {
  console.log('[EDITOR ROUTE] Starting editor route handler');
  
  // Debug all headers and cookies
  const allHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    allHeaders[key] = value;
  });
  console.log('[EDITOR ROUTE] All headers:', allHeaders);
  
  // Get user from cookie/session directly since requireAuth seems to be causing issues
  const sessionId = getCookie(c, 'editor_session');
  console.log('[EDITOR ROUTE] Session ID from cookie:', sessionId);
  
  if (!sessionId) {
    console.log('[EDITOR ROUTE] No session ID found, redirecting to login');
    return c.redirect('/auth/login');
  }
  
  console.log('[EDITOR ROUTE] Calling validateSession with ID:', sessionId);
  const user = await validateSession(sessionId);
  console.log('[EDITOR ROUTE] ValidateSession returned:', user ? `User ${user.username}` : 'null');
  
  if (!user) {
    console.log('[EDITOR ROUTE] No user found for session, redirecting to login');
    return c.redirect('/auth/login');
  }
  
  console.log('[EDITOR ROUTE] Authentication successful, proceeding with route');
  const siteName = c.req.param('sitename');
  
  try {
    const db = Database.getInstance();
    
    // Check if user owns the site or is admin
    const sites = db.query<SiteData>(
      `SELECT user_id, name, path FROM sites WHERE name = ?`,
      [siteName]
    );
    
    if (sites.length === 0) {
      return c.html(`
        <div class="message error">
          Site "${siteName}" not found.
          <a href="/dashboard">Back to Dashboard</a>
        </div>
      `);
    }
    
    const site = sites[0];
    if (!site) {
      return c.html(`
        <div class="message error">
          Site "${siteName}" not found.
          <a href="/dashboard">Back to Dashboard</a>
        </div>
      `);
    }
    
    // Check ownership
    if (site.user_id !== user.id && !user.is_admin) {
      return c.html(`
        <div class="message error">
          You don't have permission to edit this site.
          <a href="/dashboard">Back to Dashboard</a>
        </div>
      `);
    }
    
    // Check if site path exists
    const sitePath = site.path.startsWith('/') 
      ? site.path 
      : resolve(process.env.ROOT_DIR || './sites', siteName);
      
    if (!existsSync(sitePath)) {
      return c.html(`
        <div class="message error">
          Site directory not found at ${sitePath}.
          <a href="/dashboard">Back to Dashboard</a>
        </div>
      `);
    }
    
    // Render the editor page
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${siteName} - Code Editor</title>
        <link rel="stylesheet" href="/static/editor.css">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/codemirror.min.css">
        <style>
          .editor-layout {
            display: flex;
            height: calc(100vh - 60px);
            background: var(--bg-dark);
            transition: all 0.3s ease;
          }
          
          .editor-layout.three-panel .file-tree-panel {
            width: 20%;
          }
          
          .editor-layout.three-panel .editor-panel {
            width: 50%;
          }
          
          .editor-layout.three-panel .preview-panel {
            width: 30%;
            display: flex !important;
          }
          
          .file-tree-panel {
            width: 250px;
            background: var(--bg-darker);
            border-right: 2px solid var(--border);
            overflow-y: auto;
            padding: 1rem;
          }
          
          .editor-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          
          .editor-toolbar {
            background: var(--bg-darker);
            border-bottom: 2px solid var(--border);
            padding: 0.5rem 1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .editor-tabs {
            display: flex;
            background: var(--bg-darker);
            border-bottom: 1px solid var(--border);
            overflow-x: auto;
          }
          
          .editor-tab {
            padding: 0.5rem 1rem;
            border-right: 1px solid var(--border);
            cursor: pointer;
            background: var(--bg-dark);
            color: var(--text-secondary);
            font-size: 0.9rem;
          }
          
          .editor-tab.active {
            background: var(--bg-darker);
            color: var(--accent-blue);
            font-weight: bold;
          }
          
          .editor-tab.unsaved::after {
            content: " •";
            color: var(--accent-yellow);
          }
          
          #editor-container {
            flex: 1;
            overflow: hidden;
          }
          
          .CodeMirror {
            height: 100%;
            font-family: 'MonaspaceNeon', monospace;
            font-size: 14px;
          }
          
          .file-tree {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          
          .file-tree-item {
            padding: 0.25rem 0;
            cursor: pointer;
            user-select: none;
          }
          
          .file-tree-item:hover {
            color: var(--accent-blue);
          }
          
          .file-tree-item.folder::before {
            content: "▶ ";
            display: inline-block;
            width: 20px;
            transition: transform 0.2s;
          }
          
          .file-tree-item.folder.expanded::before {
            content: "▼ ";
          }
          
          .file-tree-item.file::before {
            content: "📄 ";
          }
          
          .file-tree-children {
            display: none;
          }
          
          .file-tree-children.expanded {
            display: block;
          }
          
          .file-tree-item.selected {
            color: var(--accent-blue);
            font-weight: bold;
          }
          
          .save-indicator {
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
            background: var(--accent-green);
            color: white;
            opacity: 0;
            transition: opacity 0.3s ease;
          }
          
          .save-indicator.visible {
            opacity: 1;
          }
          
          .preview-panel {
            background: var(--bg-darker);
            border-left: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
          }
          
          .preview-toolbar {
            background: var(--bg-darker);
            border-bottom: 1px solid var(--border-color);
            padding: 0.5rem 1rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 40px;
          }
          
          .preview-content {
            flex: 1;
            background: white;
            position: relative;
          }
          
          .preview-content iframe {
            border: none;
            width: 100%;
            height: 100%;
          }
          
          /* Package Manager Modal Styles */
          .packages-modal {
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
          
          .packages-modal.show {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
          }
          
          .packages-modal-content {
            background: var(--bg-dark);
            border: 2px solid var(--border);
            border-radius: 8px;
            width: 90%;
            max-width: 1200px;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
          }
          
          .packages-modal-header {
            background: var(--bg-darker);
            padding: 1rem 1.5rem;
            border-bottom: 2px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .packages-modal-body {
            padding: 1.5rem;
          }
          
          .packages-tabs {
            display: flex;
            border-bottom: 2px solid var(--border);
            margin-bottom: 1.5rem;
          }
          
          .packages-tab {
            padding: 0.75rem 1.5rem;
            background: var(--bg-dark);
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            border-bottom: 2px solid transparent;
            font-size: 0.9rem;
          }
          
          .packages-tab.active {
            color: var(--accent-blue);
            border-bottom-color: var(--accent-blue);
            background: var(--bg-darker);
          }
          
          .packages-tab-content {
            display: none;
          }
          
          .packages-tab-content.active {
            display: block;
          }
          
          .packages-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1rem;
            margin-bottom: 1.5rem;
          }
          
          .packages-card {
            background: var(--bg-darker);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 1rem;
          }
          
          .packages-card h4 {
            margin: 0 0 0.5rem 0;
            color: var(--text-primary);
            font-size: 1rem;
          }
          
          .packages-section {
            margin-bottom: 2rem;
          }
          
          .packages-section h3 {
            color: var(--text-primary);
            margin: 0 0 1rem 0;
            font-size: 1.1rem;
          }
          
          .runtime-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem;
            background: var(--bg-darker);
            border: 1px solid var(--border);
            border-radius: 4px;
            margin-bottom: 0.5rem;
          }
          
          .runtime-info {
            flex: 1;
          }
          
          .runtime-name {
            font-weight: bold;
            color: var(--text-primary);
          }
          
          .runtime-version {
            color: var(--text-secondary);
            font-size: 0.9rem;
          }
          
          .script-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem;
            background: var(--bg-darker);
            border: 1px solid var(--border);
            border-radius: 4px;
            margin-bottom: 0.5rem;
          }
          
          .script-info h5 {
            margin: 0;
            color: var(--text-primary);
          }
          
          .script-command {
            color: var(--text-secondary);
            font-size: 0.85rem;
            font-family: monospace;
          }
          
          .terminal-output {
            background: #1a1a1a;
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 1rem;
            font-family: monospace;
            font-size: 0.85rem;
            color: #00ff00;
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
            margin-top: 1rem;
          }
          
          .dependency-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0.75rem;
            background: var(--bg-darker);
            border: 1px solid var(--border);
            border-radius: 4px;
            margin-bottom: 0.25rem;
          }
          
          .dependency-info {
            flex: 1;
          }
          
          .dependency-name {
            font-weight: bold;
            color: var(--text-primary);
          }
          
          .dependency-version {
            color: var(--text-secondary);
            font-size: 0.85rem;
          }
          
          .status-indicator {
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: bold;
          }
          
          .status-installed {
            background: var(--accent-green);
            color: white;
          }
          
          .status-missing {
            background: var(--accent-red);
            color: white;
          }
          
          .status-outdated {
            background: var(--accent-yellow);
            color: black;
          }
        </style>
      </head>
      <body>
        <div class="editor-container">
          <header class="editor-header">
            <div class="editor-title">
              <a href="/dashboard" style="color: var(--accent-blue); text-decoration: none;">← Dashboard</a>
              <span style="margin: 0 0.5rem;">|</span>
              <span>${siteName}</span>
            </div>
            <div class="editor-actions">
              <!-- Git workflow controls -->
              <div id="git-controls" class="git-controls">
                <div id="readonly-mode" style="display: flex; align-items: center; gap: 0.5rem;">
                  <span style="color: var(--text-secondary); font-size: 0.9rem;">Read-only mode</span>
                  <button id="edit-btn" class="btn small primary">
                    ✏️ Edit Site
                  </button>
                </div>
                <div id="edit-mode" style="display: none; align-items: center; gap: 0.5rem;">
                  <span id="branch-indicator" style="color: var(--accent-yellow); font-size: 0.8rem; background: rgba(255,193,7,0.1); padding: 0.25rem 0.5rem; border-radius: 4px;">
                    📝 branch: edit-123456
                  </span>
                  <button id="save-btn" class="btn small primary">
                    💾 Save
                  </button>
                  <button id="deploy-btn" class="btn small" style="background: var(--accent-green);">
                    🚀 Deploy
                  </button>
                  <button id="cancel-edit-btn" class="btn small secondary">
                    ❌ Cancel
                  </button>
                </div>
              </div>
              
              <div style="margin-left: auto; display: flex; align-items: center; gap: 0.5rem;">
                <a href="${getSiteUrl(siteName)}" target="_blank" class="btn small secondary">
                  🌐 View Site
                </a>
                <span id="save-indicator" class="save-indicator">Saved!</span>
                <span style="color: var(--text-secondary);">
                  ${user.username} | 
                  <a href="/auth/logout" style="color: var(--accent-red);">Logout</a>
                </span>
              </div>
            </div>
          </header>
          
          <div class="editor-layout">
            <div class="file-tree-panel">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin: 0;">FILES</h3>
                <div style="display: flex; gap: 0.5rem;">
                  <button id="packages-btn" class="btn small" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;" title="Package Manager">
                    📦 Packages
                  </button>
                  <button id="new-file-btn" class="btn small" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;" title="New File">
                    + New
                  </button>
                </div>
              </div>
              <div id="file-tree" class="file-tree">
                <div class="file-tree-item" style="color: var(--text-secondary);">
                  Loading files...
                </div>
              </div>
            </div>
            
            <div class="editor-panel">
              <div class="editor-toolbar">
                <div id="current-file" style="color: var(--text-secondary);">
                  Select a file to edit
                </div>
              </div>
              
              <div class="editor-tabs" id="editor-tabs">
                <!-- Tabs will be added dynamically -->
              </div>
              
              <div id="editor-container">
                <textarea id="editor-textarea" style="display: none;"></textarea>
              </div>
            </div>
            
            <!-- Preview Panel - only shown in edit mode -->
            <div class="preview-panel" id="preview-panel" style="display: none;">
              <div class="preview-toolbar">
                <div style="color: var(--text-secondary); display: flex; align-items: center; gap: 0.5rem;">
                  <span>🔍 Preview</span>
                  <div id="preview-status" style="font-size: 0.8rem; opacity: 0.7;">Loading...</div>
                </div>
              </div>
              <div class="preview-content">
                <iframe id="preview-iframe" src="" style="width: 100%; height: 100%; border: none; background: white;"></iframe>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Package Manager Modal -->
        <div id="packages-modal" class="packages-modal">
          <div class="packages-modal-content">
            <div class="packages-modal-header">
              <h2 style="margin: 0; color: var(--text-primary);">📦 Package Manager</h2>
              <button id="close-packages-modal" class="btn small secondary">✕ Close</button>
            </div>
            
            <div class="packages-modal-body">
              <div class="packages-tabs">
                <button class="packages-tab active" data-tab="overview">Overview</button>
                <button class="packages-tab" data-tab="runtimes">Runtimes</button>
                <button class="packages-tab" data-tab="scripts">Scripts</button>
                <button class="packages-tab" data-tab="dependencies">Dependencies</button>
                <button class="packages-tab" data-tab="config">Config</button>
              </div>
              
              <!-- Overview Tab -->
              <div id="packages-tab-overview" class="packages-tab-content active">
                <div class="packages-grid">
                  <div class="packages-card">
                    <h4>Project Info</h4>
                    <div id="project-info">Loading project information...</div>
                  </div>
                  
                  <div class="packages-card">
                    <h4>Package Manager</h4>
                    <div id="package-manager-info">
                      <p>Detected: <span id="detected-pm">Loading...</span></p>
                      <p>Mise Config: <span id="mise-status">Loading...</span></p>
                    </div>
                  </div>
                  
                  <div class="packages-card">
                    <h4>Quick Actions</h4>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                      <button id="install-deps-btn" class="btn small primary">📥 Install Dependencies</button>
                      <button id="generate-mise-btn" class="btn small secondary">🔧 Generate Mise Config</button>
                    </div>
                  </div>
                </div>
                
                <div id="command-output" style="display: none;">
                  <h4>Command Output</h4>
                  <div id="terminal-output" class="terminal-output"></div>
                </div>
              </div>
              
              <!-- Runtimes Tab -->
              <div id="packages-tab-runtimes" class="packages-tab-content">
                <div class="packages-section">
                  <h3>Installed Runtimes</h3>
                  <div id="installed-runtimes">Loading runtimes...</div>
                </div>
                
                <div class="packages-section">
                  <h3>Add Runtime</h3>
                  <div style="display: flex; gap: 0.5rem; align-items: end;">
                    <div>
                      <label style="color: var(--text-secondary); font-size: 0.9rem;">Runtime</label>
                      <select id="runtime-select" class="btn small secondary" style="min-width: 120px;">
                        <option value="node">Node.js</option>
                        <option value="bun">Bun</option>
                        <option value="python">Python</option>
                        <option value="go">Go</option>
                        <option value="rust">Rust</option>
                      </select>
                    </div>
                    <div>
                      <label style="color: var(--text-secondary); font-size: 0.9rem;">Version</label>
                      <input id="runtime-version" type="text" placeholder="latest" class="btn small secondary" style="min-width: 100px; text-align: center;">
                    </div>
                    <button id="add-runtime-btn" class="btn small primary">+ Add Runtime</button>
                  </div>
                </div>
              </div>
              
              <!-- Scripts Tab -->
              <div id="packages-tab-scripts" class="packages-tab-content">
                <div class="packages-section">
                  <h3>Available Scripts</h3>
                  <div id="available-scripts">Loading scripts...</div>
                </div>
              </div>
              
              <!-- Dependencies Tab -->
              <div id="packages-tab-dependencies" class="packages-tab-content">
                <div class="packages-section">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3>Production Dependencies</h3>
                    <button id="add-dependency-btn" class="btn small primary">+ Add Package</button>
                  </div>
                  <div id="production-dependencies">Loading dependencies...</div>
                </div>
                
                <div class="packages-section">
                  <h3>Development Dependencies</h3>
                  <div id="development-dependencies">Loading dev dependencies...</div>
                </div>
                
                <!-- Add Dependency Form -->
                <div id="add-dependency-form" style="display: none; background: var(--bg-darker); padding: 1rem; border-radius: 4px; margin-top: 1rem;">
                  <h4 style="margin-top: 0;">Add New Package</h4>
                  <div style="display: flex; gap: 0.5rem; align-items: end;">
                    <div style="flex: 1;">
                      <label style="color: var(--text-secondary); font-size: 0.9rem;">Package Name</label>
                      <input id="dependency-name" type="text" placeholder="express" class="btn small secondary" style="width: 100%;">
                    </div>
                    <div>
                      <label style="color: var(--text-secondary); font-size: 0.9rem;">Version</label>
                      <input id="dependency-version" type="text" placeholder="latest" class="btn small secondary" style="min-width: 100px;">
                    </div>
                    <div>
                      <label style="color: var(--text-secondary); font-size: 0.9rem;">Type</label>
                      <select id="dependency-type" class="btn small secondary">
                        <option value="false">Production</option>
                        <option value="true">Development</option>
                      </select>
                    </div>
                    <button id="install-dependency-btn" class="btn small primary">Install</button>
                    <button id="cancel-add-dependency-btn" class="btn small secondary">Cancel</button>
                  </div>
                </div>
              </div>
              
              <!-- Config Tab -->
              <div id="packages-tab-config" class="packages-tab-content">
                <div class="packages-section">
                  <h3>.mise.toml Configuration</h3>
                  <div style="margin-bottom: 1rem;">
                    <button id="save-mise-config-btn" class="btn small primary">💾 Save Config</button>
                    <button id="reload-mise-config-btn" class="btn small secondary">🔄 Reload</button>
                  </div>
                  <textarea id="mise-config-editor" style="width: 100%; height: 400px; font-family: monospace; background: var(--bg-darker); color: var(--text-primary); border: 1px solid var(--border); padding: 1rem; border-radius: 4px;" placeholder="# Mise configuration will appear here"></textarea>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- CodeMirror -->
        <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/codemirror.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/javascript/javascript.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/css/css.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/xml/xml.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/htmlmixed/htmlmixed.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/markdown/markdown.min.js"></script>
        
        <script>
          // Initialize editor
          const siteName = '${siteName}';
          const sitePath = '${sitePath}';
          let currentFile = null;
          let editor = null;
          let openFiles = new Map(); // filename -> content
          let unsavedChanges = new Set();
          
          // Git workflow state
          let currentMode = 'readonly'; // 'readonly' or 'edit'
          let currentSession = null; // editing session data
          let currentBranch = 'main';
          
          // Get initial file from URL parameter
          const urlParams = new URLSearchParams(window.location.search);
          let initialFile = urlParams.get('file');
          
          // Initialize CodeMirror
          function initEditor() {
            editor = CodeMirror.fromTextArea(document.getElementById('editor-textarea'), {
              lineNumbers: true,
              theme: 'default',
              mode: 'javascript',
              indentUnit: 2,
              tabSize: 2,
              lineWrapping: true,
              autoCloseBrackets: true,
              matchBrackets: true,
              readOnly: currentMode === 'readonly' // Start in read-only mode
            });
            
            // Track changes (only in edit mode)
            editor.on('change', () => {
              if (currentFile && currentMode === 'edit') {
                unsavedChanges.add(currentFile);
                updateTabState();
              }
            });
          }
          
          // Git workflow functions
          async function enterEditMode() {
            const editBtn = document.getElementById('edit-btn');
            const originalText = editBtn.textContent;
            
            try {
              // Show initial loading state
              editBtn.textContent = '🏗️ Creating preview environment...';
              editBtn.disabled = true;
              
              // Show loading overlay with progress tracking
              showContainerLoadingState(true, null, 'Initializing Git branch...');
              
              // Create editing session
              const response = await fetch(\`/api/sites/\${siteName}/edit/start\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              
              const data = await response.json();
              
              if (data.success) {
                // Immediately redirect to the edit URL with the session ID
                // The page will reload and show the container building progress
                const editUrl = \`/editor/\${siteName}?edit=true&session=\${data.session.id}\`;
                window.location.href = editUrl;
                return; // Stop execution here since we're redirecting
                
                // Show preview panel
                document.getElementById('preview-panel').style.display = 'block';
                document.querySelector('.editor-layout').classList.add('three-panel');
                
                // Progressive container startup with better messaging
                editBtn.textContent = '📦 Building container with Railpack...';
                updateContainerProgress('Building container image with Railpack...', 'This may take 1-2 minutes on first build');
                
                // Start polling for build progress
                const buildProgress = startBuildProgressPolling(currentSession.id);
                
                const containerReady = await waitForContainerReady(data.session);
                
                // Stop polling
                if (buildProgress.stop) {
                  buildProgress.stop();
                }
                
                if (containerReady) {
                  // Enable editor
                  editor.setOption('readOnly', false);
                  
                  // Load preview
                  if (data.session.previewUrl) {
                    updateContainerProgress('Loading preview site...', '');
                    document.getElementById('preview-iframe').src = data.session.previewUrl;
                  }
                  
                  // Reload file tree and current file from the branch
                  updateContainerProgress('Syncing file tree...', '');
                  await loadFileTree();
                  if (currentFile) {
                    await loadFile(currentFile);
                  }
                  
                  showContainerLoadingState(false);
                  editBtn.textContent = '✅ Edit Mode Ready';
                } else {
                  // Container failed to start properly
                  editBtn.textContent = '❌ Container failed to start';
                  showContainerLoadingState(false, 'Container failed to start. You can still edit files, but preview may not work.');
                  
                  // Enable editor anyway for file editing
                  editor.setOption('readOnly', false);
                  await loadFileTree();
                  if (currentFile) {
                    await loadFile(currentFile);
                  }
                }
                
              } else {
                console.error('Failed to enter edit mode:', data.error);
                showContainerLoadingState(false, 'Failed to enter edit mode: ' + (data.error || 'Unknown error'));
                editBtn.textContent = '❌ Failed to enter edit mode';
              }
            } catch (error) {
              console.error('Error entering edit mode:', error);
              // Don't show alert, just update UI with error message
              showContainerLoadingState(false, 'Error entering edit mode. Please try again.');
              editBtn.textContent = '❌ Error entering edit mode';
            } finally {
              // Reset button state after a delay
              setTimeout(() => {
                if (currentMode === 'edit') {
                  editBtn.textContent = '🔧 Editing';
                } else {
                  editBtn.textContent = originalText;
                }
                editBtn.disabled = false;
              }, 2000);
            }
          }
          
          async function saveChanges() {
            if (currentMode !== 'edit' || !currentSession) {
              alert('Not in edit mode');
              return;
            }
            
            // First save the current file
            await saveFile();
            
            try {
              // Get commit message from user
              const message = prompt('Commit message (optional):') || undefined;
              
              // Commit changes to branch
              const response = await fetch(\`/api/sites/\${siteName}/edit/\${currentSession.id}/commit\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
              });
              
              const data = await response.json();
              
              if (data.success) {
                showSaveIndicator('Changes committed!');
                // Update session data
                currentSession = data.session;
                
                // Auto-refresh preview iframe after commit
                refreshPreview();
              } else {
                alert('Failed to commit changes: ' + data.error);
              }
            } catch (error) {
              console.error('Error committing changes:', error);
              alert('Error committing changes');
            }
          }
          
          async function deployChanges() {
            if (currentMode !== 'edit' || !currentSession) {
              alert('Not in edit mode');
              return;
            }
            
            if (!confirm('Deploy changes to production? This will merge your branch to main and make the changes live.')) {
              return;
            }
            
            try {
              // Deploy (merge to main)
              const response = await fetch(\`/api/sites/\${siteName}/edit/\${currentSession.id}/deploy\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              
              const data = await response.json();
              
              if (data.success) {
                alert('Changes deployed successfully!');
                // Return to read-only mode
                await exitEditMode();
              } else {
                alert('Failed to deploy changes: ' + data.error);
              }
            } catch (error) {
              console.error('Error deploying changes:', error);
              alert('Error deploying changes');
            }
          }
          
          async function cancelEdit() {
            if (currentMode !== 'edit' || !currentSession) {
              return;
            }
            
            if (unsavedChanges.size > 0) {
              if (!confirm('You have unsaved changes. Are you sure you want to cancel editing?')) {
                return;
              }
            }
            
            try {
              // Cancel editing session
              const response = await fetch(\`/api/sites/\${siteName}/edit/\${currentSession.id}\`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
              });
              
              // Return to read-only mode regardless of API response
              await exitEditMode();
              
            } catch (error) {
              console.error('Error canceling edit:', error);
              // Still exit edit mode on error
              await exitEditMode();
            }
          }
          
          async function exitEditMode() {
            currentMode = 'readonly';
            currentSession = null;
            currentBranch = 'main';
            unsavedChanges.clear();
            
            // Clear URL parameters
            updateURLWithEditState(false);
            
            // Update UI
            updateModeUI();
            
            // Disable editor
            editor.setOption('readOnly', true);
            
            // Reload from main branch
            await loadFileTree();
            if (currentFile) {
              await loadFile(currentFile);
            }
          }
          
          function updateModeUI() {
            const readonlyMode = document.getElementById('readonly-mode');
            const editMode = document.getElementById('edit-mode');
            const branchIndicator = document.getElementById('branch-indicator');
            const previewPanel = document.getElementById('preview-panel');
            const editorLayout = document.querySelector('.editor-layout');
            const viewSiteButton = document.querySelector('a[href*="getSiteUrl"]');
            
            if (currentMode === 'readonly') {
              readonlyMode.style.display = 'flex';
              editMode.style.display = 'none';
              previewPanel.style.display = 'none';
              editorLayout.classList.remove('three-panel');
              
              // Update View Site button to show main site
              const mainSiteUrl = document.querySelector('a[target="_blank"]');
              if (mainSiteUrl && mainSiteUrl.textContent.includes('🌐 View Site')) {
                mainSiteUrl.href = mainSiteUrl.href.replace(/preview-\\d+-\\w+\\./, '');
              }
            } else if (currentMode === 'building') {
              // Building state - show edit UI but indicate container is building
              readonlyMode.style.display = 'none';
              editMode.style.display = 'flex';
              previewPanel.style.display = 'flex';
              editorLayout.classList.add('three-panel');
              branchIndicator.textContent = \`⏳ Building container for branch: \${currentBranch}\`;
            } else if (currentMode === 'error') {
              // Error state - show edit UI but indicate build failed
              readonlyMode.style.display = 'none';
              editMode.style.display = 'flex';
              previewPanel.style.display = 'flex';
              editorLayout.classList.add('three-panel');
              branchIndicator.textContent = \`⚠️ Build failed for branch: \${currentBranch}\`;
              branchIndicator.style.color = '#ff4444';
            } else {
              // Edit mode
              readonlyMode.style.display = 'none';
              editMode.style.display = 'flex';
              previewPanel.style.display = 'flex';
              editorLayout.classList.add('three-panel');
              branchIndicator.textContent = \`📝 branch: \${currentBranch}\`;
              
              // Update preview iframe and View Site button
              if (currentSession && currentSession.previewUrl) {
                const previewIframe = document.getElementById('preview-iframe');
                const previewStatus = document.getElementById('preview-status');
                const mainSiteUrl = document.querySelector('a[target="_blank"]');
                
                // Load preview in iframe
                previewIframe.src = currentSession.previewUrl;
                previewStatus.textContent = 'Loading preview...';
                
                // Update View Site button to show preview
                if (mainSiteUrl && mainSiteUrl.textContent.includes('🌐 View Site')) {
                  mainSiteUrl.href = currentSession.previewUrl;
                }
                
                // Handle iframe load events
                previewIframe.onload = () => {
                  previewStatus.textContent = 'Preview loaded';
                };
                
                previewIframe.onerror = () => {
                  previewStatus.textContent = 'Preview failed to load';
                };
              }
            }
          }
          
          // Load file tree
          async function loadFileTree() {
            try {
              const response = await fetch(\`/api/sites/\${siteName}/tree\`);
              const data = await response.json();
              
              if (data.success) {
                renderFileTree(data.tree);
                
                // Show branch indicator in file tree header
                const filesHeader = document.querySelector('.file-tree-panel h3');
                if (filesHeader && data.editMode) {
                  filesHeader.innerHTML = 
                    'FILES ' +
                    '<span style="font-size: 0.7rem; color: var(--accent-blue); margin-left: 0.5rem;">' +
                      '(🌿 ' + (data.branchName || 'edit-branch') + ')' +
                    '</span>';
                } else if (filesHeader) {
                  filesHeader.textContent = 'FILES';
                }
              } else {
                document.getElementById('file-tree').innerHTML = 
                  '<div class="file-tree-item" style="color: var(--accent-red);">Failed to load files</div>';
              }
            } catch (error) {
              console.error('Error loading file tree:', error);
              document.getElementById('file-tree').innerHTML = 
                '<div class="file-tree-item" style="color: var(--accent-red);">Error loading files</div>';
            }
          }
          
          // Render file tree
          function renderFileTree(tree) {
            const container = document.getElementById('file-tree');
            container.innerHTML = '';
            
            function renderNode(node, level = 0, parentElement = container) {
              const item = document.createElement('div');
              item.className = 'file-tree-item ' + (node.type === 'file' ? 'file' : 'folder');
              item.style.paddingLeft = (level * 20) + 'px';
              item.textContent = node.name;
              
              if (node.type === 'file') {
                item.onclick = () => loadFile(node.path);
              } else if (node.type === 'folder') {
                // Create children container
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'file-tree-children';
                
                // Folder click toggles expansion
                item.onclick = () => {
                  item.classList.toggle('expanded');
                  childrenContainer.classList.toggle('expanded');
                };
                
                // Render children
                if (node.children && node.children.length > 0) {
                  node.children.forEach(child => renderNode(child, level + 1, childrenContainer));
                }
                
                parentElement.appendChild(item);
                parentElement.appendChild(childrenContainer);
                return;
              }
              
              parentElement.appendChild(item);
            }
            
            if (tree.length === 0) {
              container.innerHTML = '<div class="file-tree-item" style="color: var(--text-secondary);">No files yet</div>';
            } else {
              tree.forEach(node => renderNode(node, 0));
            }
          }
          
          // Load file content
          async function loadFile(filepath) {
            try {
              const response = await fetch(\`/api/sites/\${siteName}/file/\${filepath}\`);
              const data = await response.json();
              
              if (data.success) {
                currentFile = filepath;
                openFiles.set(filepath, data.content);
                editor.setValue(data.content);
                editor.setOption('mode', getFileMode(filepath));
                
                // Show source indicator
                let sourceIndicator = '';
                if (data.editMode) {
                  if (data.readSource === 'container') {
                    sourceIndicator = ' 📦';
                  } else if (data.readSource === 'host-fallback') {
                    sourceIndicator = ' ⚠️';
                  }
                }
                
                let currentFileHtml = filepath + sourceIndicator;
                if (data.editMode && data.branchName) {
                  currentFileHtml += '<span style="font-size: 0.7rem; color: var(--accent-yellow); margin-left: 0.5rem;">(' + data.branchName + ')</span>';
                }
                document.getElementById('current-file').innerHTML = currentFileHtml;
                updateTabState();
                
                // Update URL with current file
                updateURL(filepath);
                
                // Clear unsaved indicator for this file
                unsavedChanges.delete(filepath);
              } else {
                alert('Failed to load file: ' + data.error);
              }
            } catch (error) {
              console.error('Error loading file:', error);
              alert('Error loading file');
            }
          }
          
          // Update URL with current file
          function updateURL(filepath) {
            const url = new URL(window.location);
            if (filepath) {
              url.searchParams.set('file', filepath);
            } else {
              url.searchParams.delete('file');
            }
            window.history.pushState(null, '', url.toString());
          }
          
          // Create new file
          async function createNewFile() {
            const filename = prompt('Enter filename (e.g., index.html, script.js):');
            if (!filename) return;
            
            // Basic validation
            if (filename.includes('/') || filename.includes('\\\\')) {
              alert('Filename cannot contain path separators. Use the file tree for folders.');
              return;
            }
            
            try {
              const response = await fetch(\`/api/sites/\${siteName}/file\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  path: filename, 
                  type: 'file',
                  content: getDefaultContent(filename)
                })
              });
              
              const data = await response.json();
              
              if (data.success) {
                // Reload file tree and open the new file
                await loadFileTree();
                await loadFile(filename);
              } else {
                alert('Failed to create file: ' + data.error);
              }
            } catch (error) {
              console.error('Error creating file:', error);
              alert('Error creating file');
            }
          }
          
          // Get default content for new files
          function getDefaultContent(filename) {
            const ext = filename.split('.').pop()?.toLowerCase();
            
            const templates = {
              'html': '<!DOCTYPE html>\\n<html lang="en">\\n<head>\\n    <meta charset="UTF-8">\\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\\n    <title>Document</title>\\n</head>\\n<body>\\n    <h1>Hello World!</h1>\\n</body>\\n</html>',
              'css': '/* Add your styles here */\\nbody {\\n    font-family: Arial, sans-serif;\\n    margin: 0;\\n    padding: 20px;\\n}',
              'js': '// Add your JavaScript here\\nconsole.log("Hello World!");',
              'ts': '// Add your TypeScript here\\nconsole.log("Hello World!");',
              'md': '# Welcome\\n\\nStart writing your markdown here...',
              'json': '{\\n    "name": "my-project",\\n    "version": "1.0.0"\\n}',
              'txt': 'Hello World!'
            };
            
            return templates[ext] || '';
          }
          
          // Save current file
          async function saveFile() {
            if (!currentFile) {
              alert('No file selected');
              return;
            }
            
            try {
              const content = editor.getValue();
              const response = await fetch(\`/api/sites/\${siteName}/file/\${currentFile}\`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
              });
              
              const data = await response.json();
              
              if (data.success) {
                unsavedChanges.delete(currentFile);
                updateTabState();
                
                // Show detailed save feedback
                let saveMessage = 'Saved!';
                if (data.hasActiveSession) {
                  if (data.writeSource === 'container') {
                    saveMessage = '📦 Saved to container!';
                  } else if (data.writeSource === 'host-fallback') {
                    saveMessage = '⚠️ Saved (container fallback)';
                  }
                  
                  if (data.updateType === 'hot_reload') {
                    saveMessage += ' 🔄';
                  } else if (data.updateType === 'container_restart') {
                    saveMessage += ' 🔄 Restarting...';
                  }
                }
                
                showSaveIndicator(saveMessage);
                
                // Auto-refresh preview iframe if in edit mode
                refreshPreview();
              } else {
                alert('Failed to save: ' + data.error);
              }
            } catch (error) {
              console.error('Error saving file:', error);
              alert('Error saving file');
            }
          }
          
          // Get CodeMirror mode for file
          function getFileMode(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            const modes = {
              'js': 'javascript',
              'jsx': 'javascript',
              'ts': 'javascript',
              'tsx': 'javascript',
              'html': 'htmlmixed',
              'css': 'css',
              'md': 'markdown',
              'json': 'javascript',
              'xml': 'xml',
              'astro': 'htmlmixed',
              'vue': 'htmlmixed',
              'svelte': 'htmlmixed',
              'php': 'php',
              'py': 'python',
              'rb': 'ruby',
              'yml': 'yaml',
              'yaml': 'yaml',
              'toml': 'toml'
            };
            return modes[ext] || 'text';
          }
          
          // Update tab state
          function updateTabState() {
            // Update current tab if it exists
            const tabs = document.querySelectorAll('.editor-tab');
            tabs.forEach(tab => {
              const filename = tab.dataset.filename;
              if (filename === currentFile) {
                tab.classList.add('active');
              } else {
                tab.classList.remove('active');
              }
              
              if (unsavedChanges.has(filename)) {
                tab.classList.add('unsaved');
              } else {
                tab.classList.remove('unsaved');
              }
            });
          }
          
          // Show save indicator
          function showSaveIndicator(message = 'Saved!') {
            const indicator = document.getElementById('save-indicator');
            indicator.textContent = message;
            indicator.classList.add('visible');
            setTimeout(() => {
              indicator.classList.remove('visible');
            }, 3000);
          }
          
          // Show/hide container loading state with detailed progress
          function showContainerLoadingState(loading, errorMessage, progressMessage = 'Starting container...', subMessage = 'This may take 30-60 seconds') {
            const fileTree = document.getElementById('file-tree');
            const editorContainer = document.getElementById('editor-container');
            const previewStatus = document.getElementById('preview-status');
            
            if (loading) {
              // Remove existing overlay if present
              const existingOverlay = document.getElementById('container-loading-overlay');
              if (existingOverlay) {
                existingOverlay.remove();
              }
              
              // Show loading overlay with detailed progress
              const loadingOverlay = document.createElement('div');
              loadingOverlay.id = 'container-loading-overlay';
              loadingOverlay.innerHTML = 
                '<div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000; color: white; flex-direction: column; gap: 1rem;">' +
                  '<div style="animation: spin 1s linear infinite; font-size: 2rem;">📦</div>' +
                  '<div id="progress-main-message" style="font-size: 1.1rem; font-weight: bold; text-align: center;">' + progressMessage + '</div>' +
                  '<div id="progress-sub-message" style="font-size: 0.9rem; opacity: 0.8; text-align: center; max-width: 300px; line-height: 1.4;">' + subMessage + '</div>' +
                  '<div style="margin-top: 1rem;">' +
                    '<div id="progress-dots" style="display: flex; gap: 0.5rem;">⬜⬜⬜⬜⬜</div>' +
                  '</div>' +
                  '<div id="progress-steps" style="font-size: 0.8rem; opacity: 0.7; text-align: center; margin-top: 0.5rem;">Analyzing project structure...</div>' +
                '</div>' +
                '<style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>';
              
              fileTree.parentElement.style.position = 'relative';
              fileTree.parentElement.appendChild(loadingOverlay);
              
              // Start progress animation
              startProgressAnimation();
              
              if (previewStatus) {
                previewStatus.textContent = progressMessage;
              }
            } else {
              // Hide loading overlay and clean up any intervals
              const overlay = document.getElementById('container-loading-overlay');
              if (overlay) {
                // Clean up any progress animation intervals
                const intervalId = overlay.getAttribute('data-interval-id');
                if (intervalId) {
                  clearInterval(parseInt(intervalId));
                }
                overlay.remove();
              }
              
              if (errorMessage) {
                if (previewStatus) {
                  previewStatus.textContent = 'Container error';
                  previewStatus.style.color = 'var(--accent-red)';
                }
                // Show error message
                const errorDiv = document.createElement('div');
                errorDiv.innerHTML = 
                  '<div style="background: var(--accent-red); color: white; padding: 0.5rem; margin: 1rem; border-radius: 4px; font-size: 0.9rem;">' +
                    '⚠️ ' + errorMessage +
                  '</div>';
                fileTree.parentElement.insertBefore(errorDiv, fileTree);
              } else {
                if (previewStatus) {
                  previewStatus.textContent = 'Container ready';
                  previewStatus.style.color = 'var(--accent-green)';
                }
              }
            }
          }
          
          // Update container progress with specific messages
          function updateContainerProgress(mainMessage, subMessage) {
            const mainMsgEl = document.getElementById('progress-main-message');
            const subMsgEl = document.getElementById('progress-sub-message');
            const previewStatus = document.getElementById('preview-status');
            
            if (mainMsgEl) {
              mainMsgEl.textContent = mainMessage;
            }
            if (subMsgEl && subMessage) {
              subMsgEl.textContent = subMessage;
            }
            if (previewStatus) {
              previewStatus.textContent = mainMessage;
            }
          }
          
          // Start progress dot animation
          function startProgressAnimation() {
            let progressStep = 0;
            const progressSteps = [
              'Analyzing project structure...',
              'Generating Railpack plan...',
              'Building Docker image...',
              'Starting container...',
              'Initializing development server...'
            ];
            
            const interval = setInterval(() => {
              const dotsEl = document.getElementById('progress-dots');
              const stepsEl = document.getElementById('progress-steps');
              const overlay = document.getElementById('container-loading-overlay');
              
              // Stop if overlay is gone
              if (!overlay || !dotsEl) {
                clearInterval(interval);
                return;
              }
              
              // Update progress dots
              let dots = '';
              for (let i = 0; i < 5; i++) {
                if (i <= progressStep) {
                  dots += '🟦';
                } else {
                  dots += '⬜';
                }
              }
              dotsEl.textContent = dots;
              
              // Update step message
              if (stepsEl && progressStep < progressSteps.length) {
                stepsEl.textContent = progressSteps[progressStep];
              }
              
              progressStep = (progressStep + 1) % 6; // Cycle through steps
            }, 3000); // Update every 3 seconds
            
            // Store interval ID for cleanup
            const overlay = document.getElementById('container-loading-overlay');
            if (overlay) {
              overlay.setAttribute('data-interval-id', interval.toString());
            }
          }
          
          // Start build progress polling
          function startBuildProgressPolling(sessionId) {
            let pollCount = 0;
            const maxPolls = 60; // Poll for up to 3 minutes (60 * 3s)
            let stopped = false;
            
            const progressMessages = [
              { message: 'Analyzing project structure...', sub: 'Detecting framework and dependencies' },
              { message: 'Installing dependencies...', sub: 'Running npm/bun install in container' },
              { message: 'Building Docker image with Railpack...', sub: 'This may take 1-2 minutes on first build' },
              { message: 'Starting container...', sub: 'Initializing development server' },
              { message: 'Setting up hot reload...', sub: 'Configuring file watching' },
              { message: 'Almost ready...', sub: 'Final container health checks' }
            ];
            
            const pollInterval = setInterval(async () => {
              if (stopped || pollCount >= maxPolls) {
                clearInterval(pollInterval);
                return;
              }
              
              try {
                // Check session status
                const response = await fetch(\`/api/sites/\${siteName}/edit/status\`);
                const data = await response.json();
                
                if (data.success && data.editing && data.session) {
                  // Update progress based on poll count and container status
                  const progressIndex = Math.min(Math.floor(pollCount / 10), progressMessages.length - 1);
                  const progress = progressMessages[progressIndex];
                  
                  updateContainerProgress(progress.message, progress.sub);
                  
                  // If container is ready, we can stop polling earlier
                  if (data.session.containerName && pollCount > 5) {
                    // Try a quick health check
                    try {
                      const healthController = new AbortController();
                      setTimeout(() => healthController.abort(), 2000);
                      
                      const healthResponse = await fetch(\`/api/sites/\${siteName}/health\`, {
                        method: 'GET',
                        signal: healthController.signal
                      });
                      
                      if (healthResponse.ok) {
                        updateContainerProgress('Container ready!', 'Loading preview...');
                        clearInterval(pollInterval);
                        return;
                      }
                    } catch (healthErr) {
                      // Continue polling
                    }
                  }
                } else if (!data.editing) {
                  // Session ended or failed
                  clearInterval(pollInterval);
                  return;
                }
              } catch (err) {
                console.debug('Progress polling error:', err);
                // Continue polling - temporary network issues are expected
              }
              
              pollCount++;
            }, 3000); // Poll every 3 seconds
            
            return {
              stop: () => {
                stopped = true;
                clearInterval(pollInterval);
              }
            };
          }
          
          // Wait for container to be ready with progress updates
          async function waitForContainerReady(session, maxWaitTime = 180000) { // 3 minutes timeout
            const startTime = Date.now();
            let lastProgressUpdate = 0;
            let healthCheckAttempts = 0;
            
            updateContainerProgress('Waiting for container to respond...', 'Testing container connectivity');
            
            while (Date.now() - startTime < maxWaitTime) {
              const elapsedTime = Date.now() - startTime;
              healthCheckAttempts++;
              
              // Update progress message based on elapsed time
              if (elapsedTime - lastProgressUpdate > 10000) { // Every 10 seconds
                lastProgressUpdate = elapsedTime;
                if (elapsedTime < 20000) {
                  updateContainerProgress('Container starting up...', 'This usually takes 15-30 seconds');
                } else if (elapsedTime < 45000) {
                  updateContainerProgress('Still building container...', 'First build can take up to 2 minutes');
                } else if (elapsedTime < 90000) {
                  updateContainerProgress('Almost ready...', 'Performing final health checks');
                } else if (elapsedTime < 120000) {
                  updateContainerProgress('Taking longer than expected...', 'Large projects may take a few minutes');
                } else {
                  updateContainerProgress('Still working...', 'Complex builds can take up to 3 minutes. Almost there!');
                }
              }
              
              try {
                // Check container health by trying to access preview URL
                if (session.previewUrl) {
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 5000);
                  
                  try {
                    const response = await fetch(session.previewUrl + '/health', {
                      method: 'GET',
                      signal: controller.signal,
                      mode: 'no-cors' // Allow cross-origin for health check
                    });
                    clearTimeout(timeoutId);
                    
                    // If we get any response (even if we can't read it due to CORS), container is likely ready
                    console.log('Container health check successful');
                    updateContainerProgress('Container is responding!', 'Finalizing setup...');
                    return true;
                  } catch (fetchErr) {
                    clearTimeout(timeoutId);
                    // CORS errors are expected and actually indicate the server is running
                    if (fetchErr.name !== 'AbortError') {
                      console.log('Container responding (CORS expected)');
                      updateContainerProgress('Container is responding!', 'Finalizing setup...');
                      return true;
                    }
                  }
                }
                
                // Also check if we can load file tree (indicates container file system is ready)
                try {
                  const treeResponse = await fetch('/api/sites/' + siteName + '/tree');
                  const treeData = await treeResponse.json();
                  
                  if (treeData.success && treeData.editMode) {
                    console.log('File system ready in container');
                    updateContainerProgress('File system ready!', 'Container fully operational');
                    return true;
                  }
                } catch (treeErr) {
                  console.log('File system not ready yet:', treeErr);
                }
                
                // Alternative check: try a simple fetch to the preview URL root
                if (session.previewUrl && healthCheckAttempts > 10) {
                  try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000);
                    
                    const response = await fetch(session.previewUrl, {
                      method: 'HEAD',
                      signal: controller.signal,
                      mode: 'no-cors'
                    });
                    clearTimeout(timeoutId);
                    
                    console.log('Container root URL responding');
                    updateContainerProgress('Container ready!', 'Preview site is accessible');
                    return true;
                  } catch (rootErr) {
                    // Even CORS/network errors indicate the container is running
                    if (rootErr.name === 'TypeError' && rootErr.message.includes('CORS')) {
                      console.log('Container detected via CORS error');
                      updateContainerProgress('Container ready!', 'Preview site is accessible');
                      return true;
                    }
                  }
                }
                
              } catch (err) {
                console.log('Container readiness check failed:', err);
              }
              
              // Wait 2 seconds before next check
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            console.warn('Container readiness timeout reached');
            updateContainerProgress('Timeout reached', 'Container may still be starting...');
            return false; // Timeout reached
          }
          
          // Refresh preview iframe
          function refreshPreview() {
            if (currentMode === 'edit' && currentSession) {
              const previewIframe = document.getElementById('preview-iframe');
              if (previewIframe && currentSession.previewUrl) {
                // Add timestamp to force reload
                const url = new URL(currentSession.previewUrl);
                url.searchParams.set('_t', Date.now().toString());
                previewIframe.src = url.toString();
                
                // Update preview status
                const previewStatus = document.getElementById('preview-status');
                if (previewStatus) {
                  previewStatus.textContent = 'Refreshing...';
                  // Reset status after a delay
                  setTimeout(() => {
                    previewStatus.textContent = 'Live Preview';
                  }, 1500);
                }
              }
            }
          }
          
          // Keyboard shortcuts
          document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
              e.preventDefault();
              saveFile();
            }
          });
          
          // Git workflow event listeners
          document.getElementById('edit-btn').onclick = enterEditMode;
          document.getElementById('save-btn').onclick = saveChanges;
          document.getElementById('deploy-btn').onclick = deployChanges;
          document.getElementById('cancel-edit-btn').onclick = cancelEdit;
          
          // New file button click
          document.getElementById('new-file-btn').onclick = createNewFile;
          
          // Packages button click
          document.getElementById('packages-btn').onclick = openPackagesModal;
          
          // Check for edit mode in URL and restore session
          async function checkAndRestoreEditMode() {
            const urlParams = new URLSearchParams(window.location.search);
            const editMode = urlParams.get('edit') || urlParams.get('mode'); // Support both 'edit' and 'mode' params
            const sessionId = urlParams.get('session');
            
            if ((editMode === 'true' || editMode === 'edit') && sessionId) {
              // Show loading indicator immediately
              const statusDiv = document.getElementById('preview-status');
              if (statusDiv) {
                statusDiv.innerHTML = '<div class="info-message">⏳ Loading editing session...</div>';
              }
              
              // Function to check container status
              async function checkContainerStatus() {
                try {
                  const response = await fetch(\`/api/sites/\${siteName}/edit/status\`);
                  const data = await response.json();
                  
                  if (data.editing && data.session && data.session.id.toString() === sessionId) {
                    // Store session info
                    currentSession = data.session;
                    currentBranch = data.session.branchName;
                    
                    // Show preview panel immediately
                    if (!document.getElementById('preview-panel').style.display || document.getElementById('preview-panel').style.display === 'none') {
                      document.getElementById('preview-panel').style.display = 'block';
                      document.querySelector('.editor-layout').classList.add('three-panel');
                    }
                    
                    // Check if container is ready
                    if (data.session.containerStatus === 'building') {
                      // Container is still building, show progress in preview area
                      const previewFrame = document.getElementById('preview-iframe');
                      if (previewFrame) {
                        // Show loading state in the preview iframe
                        const loadingHtml = \`
                          <!DOCTYPE html>
                          <html>
                          <head>
                            <style>
                              body {
                                background: #1a1a1a;
                                color: #fff;
                                font-family: monospace;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                height: 100vh;
                                margin: 0;
                              }
                              .loading {
                                text-align: center;
                              }
                              .spinner {
                                border: 3px solid rgba(255,255,255,0.3);
                                border-radius: 50%;
                                border-top: 3px solid #fff;
                                width: 40px;
                                height: 40px;
                                animation: spin 1s linear infinite;
                                margin: 0 auto 20px;
                              }
                              @keyframes spin {
                                0% { transform: rotate(0deg); }
                                100% { transform: rotate(360deg); }
                              }
                            </style>
                          </head>
                          <body>
                            <div class="loading">
                              <div class="spinner"></div>
                              <div>🚀 Building development container...</div>
                              <div style="font-size: 0.9em; opacity: 0.7; margin-top: 10px;">This may take up to 3 minutes for the first build</div>
                            </div>
                          </body>
                          </html>
                        \`;
                        previewFrame.srcdoc = loadingHtml;
                      }
                      
                      // Keep editor in read-only mode
                      editor.setOption('readOnly', true);
                      
                      // Update mode UI to show we're in a transitioning state
                      currentMode = 'building';
                      updateModeUI();
                      
                      // Check again in 2 seconds
                      setTimeout(checkContainerStatus, 2000);
                      return;
                    } else if (data.session.containerStatus === 'error' || data.session.status === 'failed') {
                      // Container failed to build - show error in preview
                      const previewFrame = document.getElementById('preview-iframe');
                      if (previewFrame) {
                        const errorHtml = \`
                          <!DOCTYPE html>
                          <html>
                          <head>
                            <style>
                              body {
                                background: #1a1a1a;
                                color: #ff4444;
                                font-family: monospace;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                height: 100vh;
                                margin: 0;
                                padding: 20px;
                              }
                              .error {
                                text-align: center;
                                max-width: 600px;
                              }
                              .error-icon {
                                font-size: 48px;
                                margin-bottom: 20px;
                              }
                              .error-title {
                                font-size: 20px;
                                margin-bottom: 15px;
                              }
                              .error-message {
                                color: #ccc;
                                line-height: 1.6;
                                margin-bottom: 20px;
                              }
                              .error-actions {
                                margin-top: 20px;
                              }
                              .error-actions button {
                                background: #ff4444;
                                color: white;
                                border: none;
                                padding: 10px 20px;
                                font-size: 14px;
                                border-radius: 4px;
                                cursor: pointer;
                                margin: 0 5px;
                              }
                              .error-actions button:hover {
                                background: #ff6666;
                              }
                              pre {
                                background: #0a0a0a;
                                padding: 15px;
                                border-radius: 4px;
                                text-align: left;
                                overflow-x: auto;
                                font-size: 12px;
                                margin-top: 15px;
                                border: 1px solid #333;
                              }
                            </style>
                          </head>
                          <body>
                            <div class="error">
                              <div class="error-icon">⚠️</div>
                              <div class="error-title">Container Build Failed</div>
                              <div class="error-message">
                                The development container failed to build. This is usually due to:
                                <ul style="text-align: left; margin-top: 10px;">
                                  <li>Syntax errors in configuration files (package.json, astro.config.mjs, etc.)</li>
                                  <li>Missing dependencies or incorrect versions</li>
                                  <li>Build script errors</li>
                                </ul>
                                <pre>Check the server logs for detailed error information.</pre>
                              </div>
                              <div class="error-actions">
                                <button onclick="window.parent.location.reload()">Retry</button>
                                <button onclick="window.parent.history.back()">Go Back</button>
                              </div>
                            </div>
                          </body>
                          </html>
                        \`;
                        previewFrame.srcdoc = errorHtml;
                      }
                      
                      // Update mode UI to show error state
                      currentMode = 'error';
                      updateModeUI();
                      
                      // Keep editor in read-only mode
                      editor.setOption('readOnly', true);
                      
                      if (statusDiv) {
                        statusDiv.innerHTML = '<span style="color: #ff4444;">Build failed - check preview for details</span>';
                      }
                      
                      // Don't clear URL params - user might want to retry
                      return;
                    }
                    
                    // Container is ready, enable editing
                    currentMode = 'edit';
                    
                    // Clear any status messages
                    if (statusDiv) {
                      statusDiv.innerHTML = '';
                    }
                    
                    // Update UI
                    updateModeUI();
                    
                    // Enable editor
                    editor.setOption('readOnly', false);
                    
                    // Load preview URL
                    if (currentSession.previewUrl) {
                      const previewFrame = document.getElementById('preview-iframe');
                      if (previewFrame) {
                        previewFrame.srcdoc = ''; // Clear loading HTML
                        previewFrame.src = currentSession.previewUrl;
                      }
                    }
                    
                    console.log('Restored editing session:', currentSession.id);
                  } else {
                    // Session no longer exists, clear URL params
                    if (statusDiv) {
                      statusDiv.innerHTML = '<div class="error-message">⚠️ Session not found. Please start a new editing session.</div>';
                    }
                    updateURLWithEditState(false);
                  }
                } catch (error) {
                  console.error('Error checking session:', error);
                  if (statusDiv) {
                    statusDiv.innerHTML = '<div class="error-message">⚠️ Error loading session. Please try again.</div>';
                  }
                  updateURLWithEditState(false);
                }
              }
              
              // Start checking container status
              checkContainerStatus();
            }
          }
          
          // Update URL with edit state
          function updateURLWithEditState(isEditing, sessionId = null) {
            const url = new URL(window.location);
            if (isEditing && sessionId) {
              url.searchParams.set('mode', 'edit');
              url.searchParams.set('session', sessionId.toString());
            } else {
              url.searchParams.delete('mode');
              url.searchParams.delete('session');
            }
            window.history.replaceState({}, '', url.toString());
          }
          
          // Initialize
          updateModeUI();
          initEditor();
          loadFileTree();
          checkAndRestoreEditMode();
          
          // Load initial file from URL parameter or show welcome message
          if (initialFile) {
            // Wait a bit for file tree to load, then try to load the file
            setTimeout(() => loadFile(initialFile), 500);
          } else {
            // Show welcome message
            editor.setValue('// Welcome to the Code Editor!\\n// Select a file from the left to start editing.\\n// Click the "+ New" button to create a new file.');
          }
          
          // Handle browser back/forward for file navigation
          window.addEventListener('popstate', (event) => {
            const urlParams = new URLSearchParams(window.location.search);
            const fileParam = urlParams.get('file');
            if (fileParam && fileParam !== currentFile) {
              loadFile(fileParam);
            }
          });
          
          // Package Manager Modal Functionality
          let packagesData = null;
          
          async function openPackagesModal() {
            const modal = document.getElementById('packages-modal');
            modal.classList.add('show');
            
            // Load packages data
            await loadPackagesData();
          }
          
          function closePackagesModal() {
            const modal = document.getElementById('packages-modal');
            modal.classList.remove('show');
          }
          
          async function loadPackagesData() {
            try {
              const response = await fetch(\`/api/sites/\${siteName}/packages\`);
              const result = await response.json();
              
              if (result.success) {
                packagesData = result.data;
                updatePackagesUI();
              } else {
                console.error('Failed to load packages data:', result.error);
                showPackagesError('Failed to load packages data: ' + result.error);
              }
            } catch (error) {
              console.error('Error loading packages data:', error);
              showPackagesError('Error loading packages data');
            }
          }
          
          function updatePackagesUI() {
            if (!packagesData) return;
            
            // Update project info
            const projectInfo = document.getElementById('project-info');
            if (packagesData.packageJson.name) {
              projectInfo.innerHTML = \`
                <p><strong>Name:</strong> \${packagesData.packageJson.name}</p>
                <p><strong>Version:</strong> \${packagesData.packageJson.version || 'Not specified'}</p>
              \`;
            } else {
              projectInfo.innerHTML = '<p>No package.json found</p>';
            }
            
            // Update package manager info
            document.getElementById('detected-pm').textContent = packagesData.packageManager;
            document.getElementById('mise-status').textContent = packagesData.hasMise ? 'Available' : 'Not configured';
            
            // Update runtimes
            updateRuntimesUI();
            
            // Update scripts
            updateScriptsUI();
            
            // Update dependencies
            updateDependenciesUI();
            
            // Update mise config
            updateMiseConfigUI();
          }
          
          function updateRuntimesUI() {
            const container = document.getElementById('installed-runtimes');
            
            if (packagesData.runtimes && packagesData.runtimes.length > 0) {
              container.innerHTML = packagesData.runtimes.map(runtime => \`
                <div class="runtime-item">
                  <div class="runtime-info">
                    <div class="runtime-name">\${runtime.name}</div>
                    <div class="runtime-version">\${runtime.current || 'Not installed'}</div>
                  </div>
                  <div class="status-indicator status-\${runtime.status}">\${runtime.status}</div>
                </div>
              \`).join('');
            } else {
              container.innerHTML = '<p style="color: var(--text-secondary);">No runtimes configured</p>';
            }
          }
          
          function updateScriptsUI() {
            const container = document.getElementById('available-scripts');
            const scripts = packagesData.scripts || {};
            
            if (Object.keys(scripts).length > 0) {
              container.innerHTML = Object.entries(scripts).map(([name, command]) => \`
                <div class="script-item">
                  <div class="script-info">
                    <h5>\${name}</h5>
                    <div class="script-command">\${command}</div>
                  </div>
                  <button class="btn small primary" onclick="runScript('\${name}')">▶️ Run</button>
                </div>
              \`).join('');
            } else {
              container.innerHTML = '<p style="color: var(--text-secondary);">No scripts defined</p>';
            }
          }
          
          function updateDependenciesUI() {
            const prodContainer = document.getElementById('production-dependencies');
            const devContainer = document.getElementById('development-dependencies');
            
            const prodDeps = packagesData.dependencies.production || {};
            const devDeps = packagesData.dependencies.development || {};
            
            prodContainer.innerHTML = Object.keys(prodDeps).length > 0 
              ? Object.entries(prodDeps).map(([name, version]) => \`
                  <div class="dependency-item">
                    <div class="dependency-info">
                      <div class="dependency-name">\${name}</div>
                      <div class="dependency-version">\${version}</div>
                    </div>
                  </div>
                \`).join('')
              : '<p style="color: var(--text-secondary);">No production dependencies</p>';
            
            devContainer.innerHTML = Object.keys(devDeps).length > 0
              ? Object.entries(devDeps).map(([name, version]) => \`
                  <div class="dependency-item">
                    <div class="dependency-info">
                      <div class="dependency-name">\${name}</div>
                      <div class="dependency-version">\${version}</div>
                    </div>
                  </div>
                \`).join('')
              : '<p style="color: var(--text-secondary);">No development dependencies</p>';
          }
          
          function updateMiseConfigUI() {
            const editor = document.getElementById('mise-config-editor');
            if (packagesData.miseConfig && Object.keys(packagesData.miseConfig).length > 0) {
              // Convert config object back to TOML format for display
              editor.value = configToToml(packagesData.miseConfig);
            } else {
              editor.value = '# No .mise.toml file found\\n# Use "Generate Mise Config" to create one';
            }
          }
          
          function configToToml(config) {
            let toml = '# Mise configuration\\n';
            
            if (config.tools && Object.keys(config.tools).length > 0) {
              toml += '\\n[tools]\\n';
              Object.entries(config.tools).forEach(([tool, version]) => {
                toml += \`\${tool} = "\${version}"\\n\`;
              });
            }
            
            if (config.tasks && Object.keys(config.tasks).length > 0) {
              Object.entries(config.tasks).forEach(([taskName, task]) => {
                toml += \`\\n[tasks.\${taskName}]\\n\`;
                toml += \`run = "\${task.run}"\\n\`;
                if (task.description) {
                  toml += \`description = "\${task.description}"\\n\`;
                }
              });
            }
            
            if (config.env && Object.keys(config.env).length > 0) {
              toml += '\\n[env]\\n';
              Object.entries(config.env).forEach(([key, value]) => {
                toml += \`\${key} = "\${value}"\\n\`;
              });
            }
            
            return toml;
          }
          
          async function runScript(scriptName) {
            showCommandOutput('Running ' + scriptName + '...');
            
            try {
              const response = await fetch(\`/api/sites/\${siteName}/packages/scripts/\${scriptName}/run\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ args: [] })
              });
              
              const result = await response.json();
              
              const output = \`
Exit Code: \${result.exitCode}

STDOUT:
\${result.stdout || '(no output)'}

STDERR:
\${result.stderr || '(no errors)'}
              \`.trim();
              
              showCommandOutput(output);
              
              if (result.success) {
                showSaveIndicator(\`✅ \${scriptName} completed successfully\`);
              } else {
                alert(\`❌ Script failed: \${result.message}\`);
              }
            } catch (error) {
              console.error('Error running script:', error);
              showCommandOutput('Error running script: ' + error.message);
            }
          }
          
          async function installDependencies() {
            showCommandOutput('Installing dependencies...');
            
            try {
              const response = await fetch(\`/api/sites/\${siteName}/packages/dependencies/install\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              
              const result = await response.json();
              
              const output = \`
Exit Code: \${result.exitCode}

STDOUT:
\${result.stdout || '(no output)'}

STDERR:
\${result.stderr || '(no errors)'}
              \`.trim();
              
              showCommandOutput(output);
              
              if (result.success) {
                showSaveIndicator('✅ Dependencies installed successfully');
                // Reload packages data
                await loadPackagesData();
              } else {
                alert(\`❌ Installation failed: \${result.message}\`);
              }
            } catch (error) {
              console.error('Error installing dependencies:', error);
              showCommandOutput('Error installing dependencies: ' + error.message);
            }
          }
          
          async function addRuntime() {
            const runtime = document.getElementById('runtime-select').value;
            const version = document.getElementById('runtime-version').value || 'latest';
            
            showCommandOutput(\`Installing \${runtime}@\${version}...\`);
            
            try {
              const response = await fetch(\`/api/sites/\${siteName}/packages/runtimes/\${runtime}\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version })
              });
              
              const result = await response.json();
              
              showCommandOutput(result.output || result.message);
              
              if (result.success) {
                showSaveIndicator(\`✅ \${runtime}@\${version} installed successfully\`);
                // Reload packages data
                await loadPackagesData();
                // Clear form
                document.getElementById('runtime-version').value = '';
              } else {
                alert(\`❌ Runtime installation failed: \${result.error}\`);
              }
            } catch (error) {
              console.error('Error installing runtime:', error);
              showCommandOutput('Error installing runtime: ' + error.message);
            }
          }
          
          function showCommandOutput(output) {
            const outputDiv = document.getElementById('command-output');
            const terminalDiv = document.getElementById('terminal-output');
            
            terminalDiv.textContent = output;
            outputDiv.style.display = 'block';
            
            // Switch to overview tab to show output
            switchPackagesTab('overview');
            
            // Scroll to output
            setTimeout(() => {
              terminalDiv.scrollTop = terminalDiv.scrollHeight;
            }, 100);
          }
          
          function showPackagesError(message) {
            showCommandOutput('ERROR: ' + message);
          }
          
          function switchPackagesTab(tabName) {
            // Update tab buttons
            document.querySelectorAll('.packages-tab').forEach(tab => {
              if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
              } else {
                tab.classList.remove('active');
              }
            });
            
            // Update tab content
            document.querySelectorAll('.packages-tab-content').forEach(content => {
              if (content.id === \`packages-tab-\${tabName}\`) {
                content.classList.add('active');
              } else {
                content.classList.remove('active');
              }
            });
          }
          
          // Package Manager Modal Event Listeners
          document.getElementById('close-packages-modal').onclick = closePackagesModal;
          
          // Tab switching
          document.querySelectorAll('.packages-tab').forEach(tab => {
            tab.onclick = () => switchPackagesTab(tab.dataset.tab);
          });
          
          // Quick actions
          document.getElementById('install-deps-btn').onclick = installDependencies;
          document.getElementById('add-runtime-btn').onclick = addRuntime;
          
          // Add dependency functionality
          document.getElementById('add-dependency-btn').onclick = () => {
            document.getElementById('add-dependency-form').style.display = 'block';
          };
          
          document.getElementById('cancel-add-dependency-btn').onclick = () => {
            document.getElementById('add-dependency-form').style.display = 'none';
          };
          
          document.getElementById('install-dependency-btn').onclick = async () => {
            const packageName = document.getElementById('dependency-name').value;
            const version = document.getElementById('dependency-version').value || 'latest';
            const isDev = document.getElementById('dependency-type').value === 'true';
            
            if (!packageName) {
              alert('Please enter a package name');
              return;
            }
            
            showCommandOutput(\`Installing \${packageName}@\${version}...\`);
            
            try {
              const response = await fetch(\`/api/sites/\${siteName}/packages/dependencies\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packageName, version, isDev })
              });
              
              const result = await response.json();
              
              const output = \`
Exit Code: \${result.exitCode}

STDOUT:
\${result.stdout || '(no output)'}

STDERR:
\${result.stderr || '(no errors)'}
              \`.trim();
              
              showCommandOutput(output);
              
              if (result.success) {
                showSaveIndicator(\`✅ \${packageName} installed successfully\`);
                // Reload packages data
                await loadPackagesData();
                // Hide form and clear inputs
                document.getElementById('add-dependency-form').style.display = 'none';
                document.getElementById('dependency-name').value = '';
                document.getElementById('dependency-version').value = '';
              } else {
                alert(\`❌ Package installation failed: \${result.error}\`);
              }
            } catch (error) {
              console.error('Error installing package:', error);
              showCommandOutput('Error installing package: ' + error.message);
            }
          };
          
          // Mise config save functionality
          document.getElementById('save-mise-config-btn').onclick = async () => {
            const configContent = document.getElementById('mise-config-editor').value;
            
            try {
              // Parse TOML content back to config object (simplified)
              const response = await fetch(\`/api/sites/\${siteName}/packages/mise-config\`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  config: parseTomlToConfig(configContent) 
                })
              });
              
              const result = await response.json();
              
              if (result.success) {
                showSaveIndicator('✅ Mise config saved successfully');
                // Reload packages data
                await loadPackagesData();
              } else {
                alert('❌ Failed to save mise config: ' + result.error);
              }
            } catch (error) {
              console.error('Error saving mise config:', error);
              alert('Error saving mise config: ' + error.message);
            }
          };
          
          document.getElementById('reload-mise-config-btn').onclick = () => {
            updateMiseConfigUI();
          };
          
          function parseTomlToConfig(toml) {
            // This is a simplified TOML parser - in production you'd want a proper parser
            const config = { tools: {}, tasks: {}, env: {} };
            
            const lines = toml.split('\\n');
            let currentSection = '';
            let currentTaskName = '';
            
            for (const line of lines) {
              const trimmed = line.trim();
              
              if (trimmed === '' || trimmed.startsWith('#')) {
                continue;
              }
              
              if (trimmed.startsWith('[')) {
                if (trimmed === '[tools]') {
                  currentSection = 'tools';
                } else if (trimmed === '[env]') {
                  currentSection = 'env';
                } else if (trimmed.startsWith('[tasks.')) {
                  currentSection = 'tasks';
                  currentTaskName = trimmed.slice(7, -1);
                  config.tasks[currentTaskName] = { run: '' };
                }
                continue;
              }
              
              const equalIndex = trimmed.indexOf('=');
              if (equalIndex > 0) {
                const key = trimmed.slice(0, equalIndex).trim();
                const value = trimmed.slice(equalIndex + 1).trim().replace(/^["']|["']$/g, '');
                
                if (currentSection === 'tools') {
                  config.tools[key] = value;
                } else if (currentSection === 'env') {
                  config.env[key] = value;
                } else if (currentSection === 'tasks' && currentTaskName) {
                  if (key === 'run') {
                    config.tasks[currentTaskName].run = value;
                  } else if (key === 'description') {
                    config.tasks[currentTaskName].description = value;
                  }
                }
              }
            }
            
            return config;
          }
          
          // Close modal when clicking outside
          document.getElementById('packages-modal').onclick = (e) => {
            if (e.target.id === 'packages-modal') {
              closePackagesModal();
            }
          };
        </script>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Editor error:', error);
    return c.html(`
      <div class="message error">
        Error loading editor: ${error}
      </div>
    `);
  }
});

export { editorRoutes };