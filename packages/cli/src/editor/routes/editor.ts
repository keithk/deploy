import { Hono } from 'hono';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { Database } from '@keithk/deploy-core/src/database/database';
import { requireAuth } from './auth';
import { getSiteUrl, isEditableFile } from '../utils/site-helpers';

const editorRoutes = new Hono();

// Apply authentication to all editor routes
editorRoutes.use('*', requireAuth);

// Main editor page for a site
editorRoutes.get('/:sitename', async (c) => {
  const user = c.get('user');
  const siteName = c.req.param('sitename');
  
  try {
    const db = Database.getInstance();
    
    // Check if user owns the site or is admin
    const sites = db.query<{ user_id: number; name: string; path: string }>(
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
            content: "📁 ";
          }
          
          .file-tree-item.file::before {
            content: "📄 ";
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
                <button id="new-file-btn" class="btn small" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;" title="New File">
                  + New
                </button>
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
              // Show loading state
              editBtn.textContent = '🏗️ Creating preview environment...';
              editBtn.disabled = true;
              
              // Create editing session
              const response = await fetch(\`/api/sites/\${siteName}/edit/start\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              
              const data = await response.json();
              
              if (data.success) {
                currentMode = 'edit';
                currentSession = data.session;
                currentBranch = data.session.branchName;
                
                // Update URL to persist edit state
                updateURLWithEditState(true, currentSession.id);
                
                // Update UI
                updateModeUI();
                
                // Enable editor
                editor.setOption('readOnly', false);
                
                // Show preview panel
                document.getElementById('preview-panel').style.display = 'block';
                document.querySelector('.editor-layout').classList.add('three-panel');
                
                // Load preview
                if (data.session.previewUrl) {
                  document.getElementById('preview-iframe').src = data.session.previewUrl;
                }
                
                // Reload file tree and current file from the branch
                await loadFileTree();
                if (currentFile) {
                  await loadFile(currentFile);
                }
                
              } else {
                alert('Failed to enter edit mode: ' + data.error);
              }
            } catch (error) {
              console.error('Error entering edit mode:', error);
              alert('Error entering edit mode');
            } finally {
              // Reset button state
              editBtn.textContent = originalText;
              editBtn.disabled = false;
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
            } else {
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
            
            function renderNode(node, level = 0) {
              const item = document.createElement('div');
              item.className = 'file-tree-item ' + (node.type === 'file' ? 'file' : 'folder');
              item.style.paddingLeft = (level * 20) + 'px';
              item.textContent = node.name;
              
              if (node.type === 'file') {
                item.onclick = () => loadFile(node.path);
              }
              
              container.appendChild(item);
              
              if (node.children) {
                node.children.forEach(child => renderNode(child, level + 1));
              }
            }
            
            if (tree.length === 0) {
              container.innerHTML = '<div class="file-tree-item" style="color: var(--text-secondary);">No files yet</div>';
            } else {
              tree.forEach(node => renderNode(node));
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
                
                document.getElementById('current-file').textContent = filepath;
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
                showSaveIndicator();
                
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
              'xml': 'xml'
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
          function showSaveIndicator() {
            const indicator = document.getElementById('save-indicator');
            indicator.classList.add('visible');
            setTimeout(() => {
              indicator.classList.remove('visible');
            }, 2000);
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
          
          // Check for edit mode in URL and restore session
          async function checkAndRestoreEditMode() {
            const urlParams = new URLSearchParams(window.location.search);
            const editMode = urlParams.get('mode');
            const sessionId = urlParams.get('session');
            
            if (editMode === 'edit' && sessionId) {
              try {
                // Check if this session still exists
                const response = await fetch(\`/api/sites/\${siteName}/edit/status\`);
                const data = await response.json();
                
                if (data.editing && data.session && data.session.id.toString() === sessionId) {
                  // Restore the session
                  currentMode = 'edit';
                  currentSession = data.session;
                  currentBranch = data.session.branchName;
                  
                  // Update UI
                  updateModeUI();
                  
                  // Enable editor
                  editor.setOption('readOnly', false);
                  
                  // Show preview panel
                  document.getElementById('preview-panel').style.display = 'block';
                  document.querySelector('.editor-layout').classList.add('three-panel');
                  
                  // Load preview
                  if (currentSession.previewUrl) {
                    document.getElementById('preview-iframe').src = currentSession.previewUrl;
                  }
                  
                  console.log('Restored editing session:', currentSession.id);
                } else {
                  // Session no longer exists, clear URL params
                  updateURLWithEditState(false);
                }
              } catch (error) {
                console.error('Error checking session:', error);
                updateURLWithEditState(false);
              }
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