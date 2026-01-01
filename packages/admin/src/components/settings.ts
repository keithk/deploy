// ABOUTME: Settings page component for admin configuration
// ABOUTME: Allows setting primary site for root domain and GitHub token

interface Site {
  id: string;
  name: string;
  status: string;
}

interface Settings {
  domain?: string;
  github_configured?: boolean;
  primary_site?: string | null;
}

class DeploySettings extends HTMLElement {
  private settings: Settings = {};
  private sites: Site[] = [];
  private loading = true;
  private saving = false;

  connectedCallback() {
    this.render();
    this.loadData();
  }

  async loadData() {
    try {
      const [settingsRes, sitesRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/sites')
      ]);

      if (settingsRes.ok) {
        this.settings = await settingsRes.json();
      }
      if (sitesRes.ok) {
        this.sites = await sitesRes.json();
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async savePrimarySite(siteId: string | null) {
    this.saving = true;
    this.render();

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ primary_site: siteId })
      });

      if (response.ok) {
        this.settings.primary_site = siteId;
      }
    } catch (error) {
      console.error('Failed to save primary site:', error);
    } finally {
      this.saving = false;
      this.render();
    }
  }

  async saveDomain(domain: string) {
    this.saving = true;
    this.render();

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ domain })
      });

      if (response.ok) {
        this.settings.domain = domain;
        alert('Domain saved. Server restart required for changes to take effect.');
      }
    } catch (error) {
      console.error('Failed to save domain:', error);
    } finally {
      this.saving = false;
      this.render();
    }
  }

  render() {
    if (this.loading) {
      this.innerHTML = `
        <div class="empty-state">
          <p>Loading settings...</p>
        </div>
      `;
      return;
    }

    const runningSites = this.sites.filter(s => s.status === 'running');

    this.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Settings</h1>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">Domain</h3>
        <p class="text-muted mb-4">
          The root domain for your deploy instance (e.g., keith.is, example.com)
        </p>
        <div class="domain-input-row">
          <input
            type="text"
            id="domain-input"
            class="form-input"
            value="${this.settings.domain || ''}"
            placeholder="example.com"
            ${this.saving ? 'disabled' : ''}
          >
          <button id="save-domain-btn" class="btn btn-primary" ${this.saving ? 'disabled' : ''}>
            Save
          </button>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">Primary Site</h3>
        <p class="text-muted mb-4">
          Select which site to serve at the root domain (${this.settings.domain || 'your domain'}).
        </p>

        <div class="form-radio-group">
          <label class="form-radio">
            <input
              type="radio"
              name="primary_site"
              value=""
              ${!this.settings.primary_site ? 'checked' : ''}
              ${this.saving ? 'disabled' : ''}
            >
            <span>None (show placeholder page)</span>
          </label>
          ${runningSites.map(site => `
            <label class="form-radio">
              <input
                type="radio"
                name="primary_site"
                value="${site.id}"
                ${this.settings.primary_site === site.id ? 'checked' : ''}
                ${this.saving ? 'disabled' : ''}
              >
              <span>${site.name}</span>
            </label>
          `).join('')}
        </div>

        ${runningSites.length === 0 ? `
          <p class="text-muted mt-4" style="font-style: italic;">
            No running sites available. Deploy a site first.
          </p>
        ` : ''}
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">GitHub Integration</h3>
        <p class="text-muted">
          ${this.settings.github_configured
            ? 'GitHub token is configured for private repository access.'
            : 'No GitHub token configured. Private repositories will not be accessible.'}
        </p>
      </div>

      <style>
        .domain-input-row {
          display: flex;
          gap: var(--space-3);
        }
        .domain-input-row .form-input {
          flex: 1;
        }
      </style>
    `;

    // Add event listeners
    const radios = this.querySelectorAll('input[name="primary_site"]');
    radios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const value = target.value || null;
        this.savePrimarySite(value);
      });
    });

    this.querySelector('#save-domain-btn')?.addEventListener('click', () => {
      const input = this.querySelector('#domain-input') as HTMLInputElement;
      if (input?.value) {
        this.saveDomain(input.value);
      }
    });
  }
}

customElements.define('deploy-settings', DeploySettings);
