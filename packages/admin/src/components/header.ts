// ABOUTME: Header component with navigation and domain display
// ABOUTME: Provides links to dashboard, actions, and settings pages

interface Settings {
  domain?: string;
}

class DeployHeader extends HTMLElement {
  private domain: string = 'Loading...';

  connectedCallback() {
    this.render();
    this.loadSettings();
  }

  async loadSettings() {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const settings: Settings = await response.json();
        this.domain = settings.domain || 'deploy.local';
        this.render();
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.domain = 'deploy.local';
      this.render();
    }
  }

  render() {
    const currentPath = window.location.pathname;

    this.innerHTML = `
      <header class="flex items-center justify-between mb-4">
        <div>
          <h1 style="font-size: var(--font-size-5); font-weight: 600; color: var(--text-1);">
            <a href="/" data-route style="text-decoration: none; color: inherit;">Deploy</a>
          </h1>
          <p class="text-muted" style="font-size: var(--font-size-0); margin-top: var(--size-1);">
            ${this.domain}
          </p>
        </div>
        <nav class="nav-links">
          <a href="/" data-route class="nav-link ${currentPath === '/' ? 'active' : ''}">
            Sites
          </a>
          <a href="/actions" data-route class="nav-link ${currentPath === '/actions' ? 'active' : ''}">
            Actions
          </a>
          <a href="/settings" data-route class="nav-link ${currentPath === '/settings' ? 'active' : ''}">
            Settings
          </a>
        </nav>
      </header>

      <style>
        .nav-links {
          display: flex;
          gap: var(--size-3);
        }
        .nav-link {
          padding: var(--size-2) var(--size-3);
          border-radius: var(--radius-2);
          text-decoration: none;
          color: var(--text-2);
          font-weight: 500;
          transition: all 0.2s;
        }
        .nav-link:hover {
          color: var(--text-1);
          background: var(--surface-2);
        }
        .nav-link.active {
          color: var(--link);
          background: var(--surface-2);
        }
      </style>
    `;
  }
}

customElements.define('deploy-header', DeployHeader);
