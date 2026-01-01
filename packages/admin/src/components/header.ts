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
          <h1 class="header-title">
            <a href="/" data-route class="header-link">DEPLOY</a>
          </h1>
          <p class="header-domain text-muted">
            ${this.domain}
          </p>
        </div>
        <nav class="nav-links">
          <a href="/" data-route class="nav-link ${currentPath === '/' ? 'active' : ''}">
            SITES
          </a>
          <a href="/actions" data-route class="nav-link ${currentPath === '/actions' ? 'active' : ''}">
            ACTIONS
          </a>
          <a href="/settings" data-route class="nav-link ${currentPath === '/settings' ? 'active' : ''}">
            SETTINGS
          </a>
        </nav>
      </header>

      <style>
        .header-title {
          font-size: var(--font-size-5);
          font-weight: 400;
          color: var(--text-1);
          letter-spacing: 0.1em;
        }
        .header-link {
          text-decoration: none;
          color: inherit;
        }
        .header-domain {
          font-size: var(--font-size-0);
          margin-top: var(--size-1);
        }
        .nav-links {
          display: flex;
          gap: var(--size-3);
        }
        .nav-link {
          padding: var(--size-2) var(--size-3);
          border-radius: 0;
          text-decoration: none;
          color: var(--text-2);
          font-weight: 400;
          letter-spacing: 0.05em;
          transition: all 0.2s;
          border: 1px solid transparent;
        }
        .nav-link:hover {
          color: var(--text-1);
          border-color: var(--border);
        }
        .nav-link.active {
          color: var(--text-1);
          border-color: var(--text-1);
        }
      </style>
    `;
  }
}

customElements.define('deploy-header', DeployHeader);
