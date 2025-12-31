// ABOUTME: Header component showing domain name and settings button
// ABOUTME: Fetches domain from /api/settings endpoint

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
    this.innerHTML = `
      <header class="flex items-center justify-between mb-4">
        <div>
          <h1 style="font-size: var(--font-size-5); font-weight: 600; color: var(--text-1);">
            Deploy
          </h1>
          <p class="text-muted" style="font-size: var(--font-size-0); margin-top: var(--size-1);">
            ${this.domain}
          </p>
        </div>
        <button class="btn" id="settings-btn">
          Settings
        </button>
      </header>
    `;

    const settingsBtn = this.querySelector('#settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.handleSettings());
    }
  }

  handleSettings() {
    alert('Settings coming soon');
  }
}

customElements.define('deploy-header', DeployHeader);
