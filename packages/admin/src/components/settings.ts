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
  build_nice_level?: number;
  build_io_class?: 'idle' | 'best-effort' | 'realtime';
  build_max_parallelism?: number;
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
        const result = await response.json();
        this.settings.domain = domain;

        if (result.caddy_updated) {
          alert(`Domain saved. ${result.caddy_updated}`);
        } else {
          alert('Domain saved.');
        }
      } else {
        alert('Failed to save domain. Please try again.');
      }
    } catch (error) {
      console.error('Failed to save domain:', error);
      alert('Failed to save domain. Please try again.');
    } finally {
      this.saving = false;
      this.render();
    }
  }

  async saveBuildSettings(settings: Partial<Settings>) {
    this.saving = true;
    this.render();

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        const result = await response.json();
        this.settings.build_nice_level = result.build_nice_level;
        this.settings.build_io_class = result.build_io_class;
        this.settings.build_max_parallelism = result.build_max_parallelism;
      } else {
        alert('Failed to save build settings. Please try again.');
      }
    } catch (error) {
      console.error('Failed to save build settings:', error);
      alert('Failed to save build settings. Please try again.');
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

      <div class="settings-section">
        <h3 class="settings-section-title">Build Resources</h3>
        <p class="text-muted mb-4">
          Control how much system resources builds consume. Lower values = less resource usage but slower builds.
        </p>

        <div class="build-settings-grid">
          <div class="form-group">
            <label class="form-label" for="build-nice-level">
              CPU Priority (nice level)
              <span class="form-hint">0 = highest priority, 19 = lowest</span>
            </label>
            <input
              type="range"
              id="build-nice-level"
              class="form-range"
              min="0"
              max="19"
              value="${this.settings.build_nice_level ?? 10}"
              ${this.saving ? 'disabled' : ''}
            >
            <span class="range-value">${this.settings.build_nice_level ?? 10}</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="build-io-class">
              I/O Priority
              <span class="form-hint">Controls disk access priority during builds</span>
            </label>
            <select id="build-io-class" class="form-select" ${this.saving ? 'disabled' : ''}>
              <option value="idle" ${this.settings.build_io_class === 'idle' ? 'selected' : ''}>
                Idle (lowest - only when system idle)
              </option>
              <option value="best-effort" ${this.settings.build_io_class === 'best-effort' ? 'selected' : ''}>
                Best Effort (normal priority)
              </option>
              <option value="realtime" ${this.settings.build_io_class === 'realtime' ? 'selected' : ''}>
                Realtime (highest - not recommended)
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="build-parallelism">
              Build Parallelism
              <span class="form-hint">Max concurrent build operations (1-16)</span>
            </label>
            <input
              type="range"
              id="build-parallelism"
              class="form-range"
              min="1"
              max="8"
              value="${this.settings.build_max_parallelism ?? 2}"
              ${this.saving ? 'disabled' : ''}
            >
            <span class="range-value">${this.settings.build_max_parallelism ?? 2}</span>
          </div>
        </div>

        <button id="save-build-settings-btn" class="btn btn-primary mt-4" ${this.saving ? 'disabled' : ''}>
          Save Build Settings
        </button>
      </div>

      <style>
        .domain-input-row {
          display: flex;
          gap: var(--space-3);
        }
        .domain-input-row .form-input {
          flex: 1;
        }
        .build-settings-grid {
          display: grid;
          gap: var(--space-4);
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .form-label {
          font-weight: 500;
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .form-hint {
          font-weight: 400;
          font-size: 0.85em;
          color: var(--text-muted);
        }
        .form-range {
          width: 100%;
          max-width: 300px;
        }
        .range-value {
          font-family: var(--font-mono);
          font-size: 0.9em;
          color: var(--text-muted);
        }
        .form-select {
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          background: var(--bg-primary);
          font-size: 1rem;
          max-width: 300px;
        }
        .mt-4 {
          margin-top: var(--space-4);
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

    // Build settings: update displayed value on range change
    const niceLevel = this.querySelector('#build-nice-level') as HTMLInputElement;
    niceLevel?.addEventListener('input', () => {
      const valueSpan = niceLevel.nextElementSibling;
      if (valueSpan) valueSpan.textContent = niceLevel.value;
    });

    const parallelism = this.querySelector('#build-parallelism') as HTMLInputElement;
    parallelism?.addEventListener('input', () => {
      const valueSpan = parallelism.nextElementSibling;
      if (valueSpan) valueSpan.textContent = parallelism.value;
    });

    // Save build settings button
    this.querySelector('#save-build-settings-btn')?.addEventListener('click', () => {
      const niceInput = this.querySelector('#build-nice-level') as HTMLInputElement;
      const ioSelect = this.querySelector('#build-io-class') as HTMLSelectElement;
      const parallelismInput = this.querySelector('#build-parallelism') as HTMLInputElement;

      this.saveBuildSettings({
        build_nice_level: parseInt(niceInput?.value || '10', 10),
        build_io_class: (ioSelect?.value || 'idle') as Settings['build_io_class'],
        build_max_parallelism: parseInt(parallelismInput?.value || '2', 10),
      });
    });
  }
}

customElements.define('deploy-settings', DeploySettings);
