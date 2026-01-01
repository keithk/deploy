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
          <div class="card empty-state">
            <p class="text-muted">loading settings...</p>
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
            <h1 class="settings-title">
              SETTINGS
            </h1>
            <p class="settings-domain text-muted">
              ${this.settings.domain || 'deploy.local'}
            </p>
          </div>
          <a href="/" data-route class="btn">
            BACK TO DASHBOARD
          </a>
        </header>

        <div class="card settings-card">
          <h2 class="settings-section-title">
            PRIMARY SITE
          </h2>
          <p class="settings-description text-muted">
            select which site to serve at the root domain (${this.settings.domain}).
          </p>

          <div class="radio-options">
            <label class="radio-option ${!this.settings.primary_site ? 'selected' : ''}">
              <input
                type="radio"
                name="primary_site"
                value=""
                ${!this.settings.primary_site ? 'checked' : ''}
                ${this.saving ? 'disabled' : ''}
              >
              <span>none (show placeholder page)</span>
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
            <p class="no-sites-hint text-muted">
              no running sites available. deploy a site first.
            </p>
          ` : ''}
        </div>

        <div class="card settings-card">
          <h2 class="settings-section-title">
            GITHUB INTEGRATION
          </h2>
          <p class="settings-description text-muted">
            ${this.settings.github_configured
              ? 'github token is configured for private repository access.'
              : 'no github token configured. private repositories will not be accessible.'}
          </p>
        </div>
      </div>

      <style>
        .empty-state {
          text-align: center;
          padding: var(--size-5);
        }
        .settings-title {
          font-size: var(--font-size-5);
          font-weight: 400;
          color: var(--text-1);
          letter-spacing: 0.1em;
        }
        .settings-domain {
          font-size: var(--font-size-0);
          margin-top: var(--size-1);
        }
        .settings-card {
          margin-top: var(--size-5);
        }
        .settings-card:first-of-type {
          margin-top: 0;
        }
        .settings-section-title {
          font-size: var(--font-size-3);
          font-weight: 400;
          color: var(--text-1);
          margin-bottom: var(--size-4);
          letter-spacing: 0.05em;
        }
        .settings-description {
          margin-bottom: var(--size-4);
        }
        .radio-options {
          display: flex;
          flex-direction: column;
          gap: var(--size-2);
        }
        .radio-option {
          display: flex;
          align-items: center;
          gap: var(--size-2);
          padding: var(--size-3);
          border: 1px solid var(--border);
          border-radius: 0;
          cursor: pointer;
          transition: all 0.2s;
        }
        .radio-option:hover {
          border-color: var(--text-1);
        }
        .radio-option.selected {
          border-color: var(--text-1);
          background: var(--surface-3);
        }
        .radio-option input {
          accent-color: var(--text-1);
        }
        .no-sites-hint {
          margin-top: var(--size-3);
          font-style: italic;
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
