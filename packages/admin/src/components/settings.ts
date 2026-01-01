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

  render() {
    if (this.loading) {
      this.innerHTML = `
        <div class="container">
          <div class="card" style="text-align: center; padding: var(--size-5);">
            <p class="text-muted">Loading settings...</p>
          </div>
        </div>
      `;
      return;
    }

    const runningSites = this.sites.filter(s => s.status === 'running');

    this.innerHTML = `
      <div class="container">
        <header class="flex items-center justify-between mb-4">
          <div>
            <h1 style="font-size: var(--font-size-5); font-weight: 600; color: var(--text-1);">
              Settings
            </h1>
            <p class="text-muted" style="font-size: var(--font-size-0); margin-top: var(--size-1);">
              ${this.settings.domain || 'deploy.local'}
            </p>
          </div>
          <a href="/" data-route class="btn">
            Back to Dashboard
          </a>
        </header>

        <div class="card" style="margin-top: var(--size-5);">
          <h2 style="font-size: var(--font-size-3); font-weight: 600; color: var(--text-1); margin-bottom: var(--size-4);">
            Primary Site
          </h2>
          <p class="text-muted" style="margin-bottom: var(--size-4);">
            Select which site to serve at the root domain (${this.settings.domain}).
          </p>

          <div style="display: flex; flex-direction: column; gap: var(--size-2);">
            <label class="radio-option ${!this.settings.primary_site ? 'selected' : ''}">
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
              <label class="radio-option ${this.settings.primary_site === site.id ? 'selected' : ''}">
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
            <p class="text-muted" style="margin-top: var(--size-3); font-style: italic;">
              No running sites available. Deploy a site first.
            </p>
          ` : ''}
        </div>

        <div class="card" style="margin-top: var(--size-4);">
          <h2 style="font-size: var(--font-size-3); font-weight: 600; color: var(--text-1); margin-bottom: var(--size-4);">
            GitHub Integration
          </h2>
          <p class="text-muted" style="margin-bottom: var(--size-3);">
            ${this.settings.github_configured
              ? 'GitHub token is configured for private repository access.'
              : 'No GitHub token configured. Private repositories will not be accessible.'}
          </p>
        </div>
      </div>

      <style>
        .radio-option {
          display: flex;
          align-items: center;
          gap: var(--size-2);
          padding: var(--size-3);
          border: 1px solid var(--surface-3);
          border-radius: var(--radius-2);
          cursor: pointer;
          transition: all 0.2s;
        }
        .radio-option:hover {
          border-color: var(--link);
        }
        .radio-option.selected {
          border-color: var(--link);
          background: var(--surface-2);
        }
        .radio-option input {
          accent-color: var(--link);
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
  }
}

customElements.define('deploy-settings', DeploySettings);
