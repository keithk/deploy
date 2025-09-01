/**
 * Shared Login Form Component
 * Generates consistent login forms for admin and editor
 */

export interface LoginFormOptions {
  title: string;
  subtitle?: string;
  action: string;
  errorParam?: string;
  usernameLabel?: string;
  passwordLabel?: string;
  submitLabel?: string;
  footerText?: string;
  cssPath?: string;
  isAdmin?: boolean;
}

/**
 * Generate HTML for login page
 */
export function generateLoginPage(options: LoginFormOptions): string {
  const {
    title,
    subtitle = '',
    action,
    errorParam = 'error',
    usernameLabel = 'Username',
    passwordLabel = 'Password',
    submitLabel = 'Sign In',
    footerText = 'Made with ❤️ in mono',
    cssPath = '/static/shared.css',
    isAdmin = false
  } = options;
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <link rel="stylesheet" href="${cssPath}">
      ${isAdmin ? '<link rel="stylesheet" href="/static/admin.css">' : ''}
    </head>
    <body>
      <div class="login-container">
        <form class="login-box" method="POST" action="${action}">
          <div class="login-title">${title.toUpperCase()}</div>
          ${subtitle ? `<div class="login-subtitle">${subtitle}</div>` : ''}
          
          <div class="form-group">
            <label class="form-label" for="username">${usernameLabel}:</label>
            <input 
              type="text" 
              id="username" 
              name="username" 
              class="form-input" 
              required 
              autocomplete="username"
              placeholder="${isAdmin ? 'admin' : 'Enter your username'}"
              autofocus
            >
          </div>
          
          <div class="form-group">
            <label class="form-label" for="password">${passwordLabel}:</label>
            <input 
              type="password" 
              id="password" 
              name="password" 
              class="form-input" 
              required 
              autocomplete="current-password"
              placeholder="••••••••"
            >
          </div>
          
          <div class="form-group">
            <button type="submit" class="btn primary" style="width: 100%;">
              [${submitLabel.toUpperCase()}]
            </button>
          </div>
          
          ${!isAdmin ? `
          <div class="form-links">
            <a href="/auth/register" class="link">Create Account</a>
            <span class="separator">•</span>
            <a href="/auth/forgot" class="link">Forgot Password?</a>
          </div>
          ` : ''}
          
          <div style="text-align: center; margin-top: 2rem; color: var(--text-secondary); font-size: 0.8rem;">
            ${footerText}
          </div>
        </form>
      </div>
      
      <script>
        // Get error from URL params and display it
        const params = new URLSearchParams(window.location.search);
        const error = params.get('${errorParam}');
        if (error) {
          const form = document.querySelector('.login-box');
          const errorDiv = document.createElement('div');
          errorDiv.className = 'message error';
          errorDiv.textContent = error;
          form.insertBefore(errorDiv, form.firstElementChild.nextSibling);
        }
      </script>
    </body>
    </html>
  `;
}

/**
 * Generate dashboard HTML header
 */
export function generateDashboardHeader(
  title: string,
  user: { username: string; is_admin?: boolean },
  currentPath: string = '/'
): string {
  return `
    <header class="header">
      <div class="header-content">
        <h1 class="header-title">${title}</h1>
        <nav class="header-nav">
          <a href="/dashboard" class="${currentPath === '/dashboard' ? 'active' : ''}">Dashboard</a>
          ${user.is_admin ? `
            <a href="/admin/users" class="${currentPath === '/admin/users' ? 'active' : ''}">Users</a>
            <a href="/admin/settings" class="${currentPath === '/admin/settings' ? 'active' : ''}">Settings</a>
          ` : `
            <a href="/editor/sites" class="${currentPath === '/editor/sites' ? 'active' : ''}">Sites</a>
            <a href="/editor/templates" class="${currentPath === '/editor/templates' ? 'active' : ''}">Templates</a>
          `}
        </nav>
        <div class="header-user">
          <span class="username">${user.username}</span>
          <form method="POST" action="/auth/logout" style="display: inline;">
            <button type="submit" class="btn-link">Logout</button>
          </form>
        </div>
      </div>
    </header>
  `;
}

/**
 * Generate a consistent message box
 */
export function generateMessageBox(
  message: string,
  type: 'success' | 'error' | 'warning' | 'info' = 'info'
): string {
  return `<div class="message ${type}">${message}</div>`;
}

/**
 * Generate a data table
 */
export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  format?: (value: any) => string;
}

export function generateDataTable(
  columns: TableColumn[],
  data: any[],
  options: {
    id?: string;
    class?: string;
    emptyMessage?: string;
    actions?: (row: any) => string;
  } = {}
): string {
  const {
    id = '',
    class: className = 'data-table',
    emptyMessage = 'No data available',
    actions
  } = options;
  
  if (!data || data.length === 0) {
    return `<div class="empty-state">${emptyMessage}</div>`;
  }
  
  let html = `<table ${id ? `id="${id}"` : ''} class="${className}">`;
  
  // Header
  html += '<thead><tr>';
  for (const col of columns) {
    html += `<th align="${col.align || 'left'}">${col.label}</th>`;
  }
  if (actions) {
    html += '<th align="center">Actions</th>';
  }
  html += '</tr></thead>';
  
  // Body
  html += '<tbody>';
  for (const row of data) {
    html += '<tr>';
    for (const col of columns) {
      const value = row[col.key];
      const formatted = col.format ? col.format(value) : value;
      html += `<td align="${col.align || 'left'}">${formatted ?? ''}</td>`;
    }
    if (actions) {
      html += `<td align="center">${actions(row)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';
  
  html += '</table>';
  
  return html;
}

/**
 * Generate a card component
 */
export interface CardOptions {
  title: string;
  subtitle?: string;
  content: string;
  footer?: string;
  actions?: string;
  class?: string;
}

export function generateCard(options: CardOptions): string {
  const {
    title,
    subtitle,
    content,
    footer,
    actions,
    class: className = 'card'
  } = options;
  
  return `
    <div class="${className}">
      <div class="card-header">
        <h3 class="card-title">${title}</h3>
        ${subtitle ? `<p class="card-subtitle">${subtitle}</p>` : ''}
      </div>
      <div class="card-content">
        ${content}
      </div>
      ${footer || actions ? `
        <div class="card-footer">
          ${footer || ''}
          ${actions ? `<div class="card-actions">${actions}</div>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Generate breadcrumb navigation
 */
export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function generateBreadcrumbs(items: BreadcrumbItem[]): string {
  const parts = items.map((item, index) => {
    const isLast = index === items.length - 1;
    if (isLast || !item.href) {
      return `<span class="breadcrumb-item current">${item.label}</span>`;
    }
    return `<a href="${item.href}" class="breadcrumb-item">${item.label}</a>`;
  });
  
  return `
    <nav class="breadcrumbs">
      ${parts.join('<span class="breadcrumb-separator">/</span>')}
    </nav>
  `;
}