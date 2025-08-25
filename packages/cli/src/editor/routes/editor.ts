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
              <span id="save-indicator" class="save-indicator">Saved!</span>
              <button id="save-btn" class="btn small primary" style="margin-left: 1rem;">
                Save (⌘S)
              </button>
              <a href="${getSiteUrl(siteName)}" target="_blank" class="btn small secondary" style="margin-left: 0.5rem;">
                View Site
              </a>
              <span style="margin-left: 1rem;">
                ${user.username} | 
                <a href="/auth/logout" style="color: var(--accent-red);">Logout</a>
              </span>
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
              matchBrackets: true
            });
            
            // Track changes
            editor.on('change', () => {
              if (currentFile) {
                unsavedChanges.add(currentFile);
                updateTabState();
              }
            });
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
          
          // Keyboard shortcuts
          document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
              e.preventDefault();
              saveFile();
            }
          });
          
          // Save button click
          document.getElementById('save-btn').onclick = saveFile;
          
          // New file button click
          document.getElementById('new-file-btn').onclick = createNewFile;
          
          // Initialize
          initEditor();
          loadFileTree();
          
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