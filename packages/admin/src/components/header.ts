// ABOUTME: App header component with navigation and theme toggle
// ABOUTME: Provides site branding, nav links, and light/dark/system theme switching

interface Settings {
  domain?: string;
}

class DeployHeader extends HTMLElement {
  private domain: string = '';
  private currentTheme: 'system' | 'light' | 'dark' = 'system';

  connectedCallback() {
    this.loadTheme();
    this.render();
    this.loadSettings();

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.currentTheme === 'system') {
        this.applyTheme();
      }
    });
  }

  async loadSettings() {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const settings: Settings = await response.json();
        this.domain = settings.domain || window.location.hostname;
        this.render();
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.domain = window.location.hostname;
      this.render();
    }
  }

  loadTheme() {
    const stored = localStorage.getItem('theme') as 'system' | 'light' | 'dark' | null;
    this.currentTheme = stored || 'system';
    this.applyTheme();
  }

  applyTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let effectiveTheme: 'light' | 'dark';

    if (this.currentTheme === 'system') {
      effectiveTheme = prefersDark ? 'dark' : 'light';
    } else {
      effectiveTheme = this.currentTheme;
    }

    document.documentElement.setAttribute('data-theme', effectiveTheme);
  }

  setTheme(theme: 'system' | 'light' | 'dark') {
    this.currentTheme = theme;
    localStorage.setItem('theme', theme);
    this.applyTheme();
    this.render();
  }

  getCurrentPath(): string {
    return window.location.pathname;
  }

  render() {
    const path = this.getCurrentPath();

    this.innerHTML = `
      <header class="app-header">
        <div class="header-inner">
          <div class="header-left">
            <a href="/" class="header-brand" data-route>
              <span class="header-brand-name">deploy</span>
              <span class="header-brand-domain">${this.domain || window.location.hostname}</span>
            </a>
            <nav class="header-nav">
              <a href="/" class="nav-link ${path === '/' ? 'active' : ''}" data-route>Sites</a>
              <a href="/deployments" class="nav-link ${path === '/deployments' ? 'active' : ''}" data-route>Deployments</a>
              <a href="/actions" class="nav-link ${path === '/actions' ? 'active' : ''}" data-route>Actions</a>
              <a href="/settings" class="nav-link ${path === '/settings' ? 'active' : ''}" data-route>Settings</a>
            </nav>
          </div>
          <div class="header-right">
            <div class="theme-toggle">
              <button class="theme-btn ${this.currentTheme === 'system' ? 'active' : ''}" data-theme="system" title="System theme">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <line x1="8" y1="21" x2="16" y2="21"></line>
                  <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
              </button>
              <button class="theme-btn ${this.currentTheme === 'light' ? 'active' : ''}" data-theme="light" title="Light theme">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              </button>
              <button class="theme-btn ${this.currentTheme === 'dark' ? 'active' : ''}" data-theme="dark" title="Dark theme">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              </button>
            </div>
            <button class="btn btn-ghost" id="sign-out-btn">Sign out</button>
          </div>
        </div>
      </header>
    `;

    // Theme toggle handlers
    this.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const theme = (e.currentTarget as HTMLElement).dataset.theme as 'system' | 'light' | 'dark';
        this.setTheme(theme);
      });
    });

    // Sign out handler
    this.querySelector('#sign-out-btn')?.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/login';
      } catch (error) {
        console.error('Logout failed:', error);
      }
    });
  }
}

customElements.define('deploy-header', DeployHeader);
