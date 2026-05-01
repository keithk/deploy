// ABOUTME: Modal component for creating new sites.
// ABOUTME: Supports GitHub repo picker, manual git URL entry, or docker-compose source.

import { showToast } from './toast.js';

interface GitHubRepo {
  name: string;
  full_name: string;
  clone_url: string;
  description: string | null;
  private: boolean;
  updated_at: string;
}

interface ComposeService {
  name: string;
  ports: number[];
}

type SourceType = 'github' | 'compose';

class DeployNewSiteModal extends HTMLElement {
  private sourceType: SourceType = 'github';

  // Github source
  private gitUrl: string = '';
  private repos: GitHubRepo[] = [];
  private loadingRepos: boolean = false;
  private showRepoPicker: boolean = false;
  private repoFilter: string = '';
  private githubConfigured: boolean = false;

  // Compose source
  private composeYaml: string = '';
  private composeUrl: string = '';
  private fetchingCompose: boolean = false;
  private parsingCompose: boolean = false;
  private composeServices: ComposeService[] = [];
  private composeError: string = '';
  private primaryService: string = '';
  private primaryPort: number | null = null;
  private envText: string = '';
  private persistentStorage: boolean = false;

  // Shared
  private subdomain: string = '';
  private submitting: boolean = false;
  private domain: string = '';
  private sleepEnabled: boolean = true;
  private sleepAfterMinutes: string = '';

  async connectedCallback() {
    await this.loadSettings();
    this.render();
    document.addEventListener('keydown', this.handleKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.handleKeydown);
  }

  handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.handleCancel();
    }
  }

  async loadSettings() {
    try {
      const res = await fetch('/api/settings');
      const settings = await res.json();
      this.domain = settings.domain || window.location.hostname;
      this.githubConfigured = settings.github_configured || false;
    } catch {
      this.domain = window.location.hostname;
    }
  }

  async loadRepos() {
    this.loadingRepos = true;
    this.render();

    try {
      const res = await fetch('/api/github/repos');
      if (res.ok) {
        this.repos = await res.json();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to load repos', 'error');
      }
    } catch (err) {
      console.error('Failed to load repos:', err);
      showToast('Failed to load repos', 'error');
    }

    this.loadingRepos = false;
    this.render();
  }

  setSourceType(type: SourceType) {
    if (this.sourceType === type) return;
    this.sourceType = type;
    this.showRepoPicker = false;
    this.composeError = '';
    this.render();
  }

  handleGitUrlChange(url: string) {
    this.gitUrl = url;
    if (url) {
      const suggested = this.suggestSubdomain(url);
      if (suggested && !this.subdomain) {
        this.subdomain = suggested;
        this.render();
      }
    }
  }

  handleSubdomainChange(subdomain: string) {
    this.subdomain = subdomain;
  }

  handleRepoSelect(repo: GitHubRepo) {
    this.gitUrl = repo.clone_url;
    this.subdomain = this.suggestSubdomain(repo.name);
    this.showRepoPicker = false;
    this.render();
  }

  suggestSubdomain(gitUrl: string): string {
    try {
      let repoName = gitUrl;
      repoName = repoName.replace(/\.git$/, '');
      const parts = repoName.split('/');
      repoName = parts[parts.length - 1];
      repoName = repoName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/--+/g, '-')
        .replace(/^-|-$/g, '');
      return repoName;
    } catch {
      return '';
    }
  }

  async parseComposeFromYaml() {
    if (!this.composeYaml.trim()) {
      this.composeServices = [];
      this.primaryService = '';
      this.primaryPort = null;
      this.composeError = '';
      this.render();
      return;
    }
    this.parsingCompose = true;
    this.composeError = '';
    this.render();
    try {
      const res = await fetch('/api/compose/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: this.composeYaml }),
      });
      const body = await res.json();
      if (!res.ok) {
        this.composeError = body.error || 'Failed to parse compose file';
        this.composeServices = [];
        this.primaryService = '';
        this.primaryPort = null;
      } else {
        this.composeServices = body.services || [];
        const candidates: string[] = body.candidates || [];
        if (candidates.length > 0 && !candidates.includes(this.primaryService)) {
          this.primaryService = candidates[0];
          const svc = this.composeServices.find((s) => s.name === this.primaryService);
          this.primaryPort = svc?.ports[0] ?? null;
        }
      }
    } catch (err) {
      this.composeError = err instanceof Error ? err.message : 'Failed to parse compose file';
    } finally {
      this.parsingCompose = false;
      this.render();
    }
  }

  async fetchComposeFromUrl() {
    if (!this.composeUrl.trim()) return;
    this.fetchingCompose = true;
    this.composeError = '';
    this.render();
    try {
      const res = await fetch('/api/compose/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: this.composeUrl }),
      });
      const body = await res.json();
      if (!res.ok) {
        this.composeError = body.error || 'Failed to fetch compose file';
      } else {
        this.composeYaml = body.yaml || '';
        this.composeServices = body.services || [];
        const candidates: string[] = body.candidates || [];
        if (candidates.length > 0) {
          this.primaryService = candidates[0];
          const svc = this.composeServices.find((s) => s.name === this.primaryService);
          this.primaryPort = svc?.ports[0] ?? null;
        }
      }
    } catch (err) {
      this.composeError = err instanceof Error ? err.message : 'Failed to fetch compose file';
    } finally {
      this.fetchingCompose = false;
      this.render();
    }
  }

  handlePrimaryServiceChange(serviceName: string) {
    this.primaryService = serviceName;
    const svc = this.composeServices.find((s) => s.name === serviceName);
    this.primaryPort = svc?.ports[0] ?? null;
    this.render();
  }

  async handleSubmit(e: Event) {
    e.preventDefault();

    if (this.sourceType === 'github') {
      return this.submitGithub();
    }
    return this.submitCompose();
  }

  async submitGithub() {
    if (!this.gitUrl || !this.subdomain) {
      showToast('Please fill in all fields', 'error');
      return;
    }
    this.submitting = true;
    this.render();
    try {
      const response = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'github',
          git_url: this.gitUrl,
          name: this.subdomain,
          sleep_enabled: this.sleepEnabled,
          sleep_after_minutes: this.sleepAfterMinutes === '' ? null : parseInt(this.sleepAfterMinutes, 10),
        }),
      });
      await this.handleCreateResponse(response);
    } catch (err) {
      console.error('Create site failed:', err);
      showToast('Failed to create site', 'error');
      this.submitting = false;
      this.render();
    }
  }

  async submitCompose() {
    if (!this.subdomain) {
      showToast('Subdomain is required', 'error');
      return;
    }
    if (!this.composeYaml.trim()) {
      showToast('Paste or fetch a compose file', 'error');
      return;
    }
    if (!this.primaryService || this.primaryPort == null) {
      showToast('Pick a primary service', 'error');
      return;
    }
    this.submitting = true;
    this.render();
    try {
      const response = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'compose',
          name: this.subdomain,
          compose_yaml: this.composeYaml,
          primary_service: this.primaryService,
          primary_port: this.primaryPort,
          env_text: this.envText,
          persistent_storage: this.persistentStorage,
          git_url: this.composeUrl || null,
          sleep_enabled: this.sleepEnabled,
          sleep_after_minutes: this.sleepAfterMinutes === '' ? null : parseInt(this.sleepAfterMinutes, 10),
        }),
      });
      await this.handleCreateResponse(response);
    } catch (err) {
      console.error('Create site failed:', err);
      showToast('Failed to create site', 'error');
      this.submitting = false;
      this.render();
    }
  }

  async handleCreateResponse(response: Response) {
    if (response.ok) {
      this.dispatchEvent(new CustomEvent('site-created', {
        bubbles: true,
        detail: await response.json(),
      }));
      this.dispatchEvent(new CustomEvent('close'));
      this.remove();
      return;
    }
    const err = await response.json().catch(() => ({}));
    showToast(`Failed to create site: ${err.error || 'Unknown error'}`, 'error');
    this.submitting = false;
    this.render();
  }

  handleCancel() {
    this.dispatchEvent(new CustomEvent('close'));
    this.remove();
  }

  toggleRepoPicker() {
    this.showRepoPicker = !this.showRepoPicker;
    if (this.showRepoPicker && this.repos.length === 0) {
      this.loadRepos();
    } else {
      this.render();
    }
  }

  handleRepoFilterChange(filter: string) {
    this.repoFilter = filter.toLowerCase();
    this.render();
  }

  getFilteredRepos(): GitHubRepo[] {
    if (!this.repoFilter) return this.repos;
    return this.repos.filter(repo =>
      repo.name.toLowerCase().includes(this.repoFilter) ||
      (repo.description && repo.description.toLowerCase().includes(this.repoFilter))
    );
  }

  private renderSourceSwitch(): string {
    return `
      <div class="source-switch">
        <button type="button" class="source-pill ${this.sourceType === 'github' ? 'active' : ''}" data-source="github">From GitHub</button>
        <button type="button" class="source-pill ${this.sourceType === 'compose' ? 'active' : ''}" data-source="compose">From Docker Compose</button>
      </div>
    `;
  }

  private renderGithubBody(filteredRepos: GitHubRepo[]): string {
    return `
      ${this.githubConfigured ? `
        <div class="form-group">
          <button
            type="button"
            class="btn ${this.showRepoPicker ? '' : 'btn-primary'}"
            id="toggle-repos-btn"
            style="width: 100%"
            ${this.submitting ? 'disabled' : ''}
          >
            ${this.showRepoPicker ? '← Back to form' : 'Select from GitHub'}
          </button>
        </div>
      ` : ''}

      ${this.showRepoPicker ? `
        <div class="form-group">
          <input
            type="text"
            class="form-input"
            placeholder="Filter repos..."
            id="repo-filter"
            value="${this.repoFilter}"
          />
        </div>
        <div class="repo-list">
          ${this.loadingRepos ? `
            <div class="repo-empty">Loading repos...</div>
          ` : filteredRepos.length === 0 ? `
            <div class="repo-empty">No repos found</div>
          ` : filteredRepos.map(repo => `
            <div class="repo-item" data-clone-url="${repo.clone_url}" data-name="${repo.name}">
              <div class="repo-name">${repo.name}</div>
              ${repo.description ? `<div class="repo-description">${repo.description}</div>` : ''}
              <div class="repo-meta">
                ${repo.private ? 'Private' : 'Public'} · ${new Date(repo.updated_at).toLocaleDateString()}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="form-group">
          <label class="form-label" for="git-url">Git URL</label>
          <input
            type="text"
            id="git-url"
            class="form-input"
            placeholder="https://github.com/user/repo.git"
            value="${this.gitUrl}"
            ${this.submitting ? 'disabled' : ''}
            required
          />
        </div>

        ${this.renderSubdomainField()}
        ${this.renderSleepFields()}
      `}
    `;
  }

  private renderComposeBody(): string {
    const candidates = this.composeServices.filter(s => s.ports.length > 0);

    return `
      <div class="form-group">
        <label class="form-label" for="compose-url">Fetch from URL <span class="text-muted">(optional)</span></label>
        <div class="compose-fetch-row">
          <input
            type="url"
            id="compose-url"
            class="form-input"
            placeholder="https://raw.githubusercontent.com/.../docker-compose.yml"
            value="${this.composeUrl}"
            ${this.submitting ? 'disabled' : ''}
          />
          <button
            type="button"
            class="btn"
            id="fetch-compose-btn"
            ${this.fetchingCompose || !this.composeUrl ? 'disabled' : ''}
          >
            ${this.fetchingCompose ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="compose-yaml">Compose file</label>
        <textarea
          id="compose-yaml"
          class="form-input compose-textarea"
          placeholder="services:&#10;  app:&#10;    image: ghcr.io/user/app:latest&#10;    ports:&#10;      - &quot;9000:9000&quot;"
          ${this.submitting ? 'disabled' : ''}
          spellcheck="false"
        >${this.composeYaml}</textarea>
        ${this.parsingCompose ? `<p class="text-muted" style="font-size: var(--text-xs); margin-top: var(--space-1)">Parsing…</p>` : ''}
        ${this.composeError ? `<p class="text-error" style="font-size: var(--text-xs); margin-top: var(--space-1)">${this.composeError}</p>` : ''}
      </div>

      ${candidates.length > 0 ? `
        <div class="form-group">
          <label class="form-label" for="primary-service">Primary service (the one routed at this subdomain)</label>
          <select
            id="primary-service"
            class="form-select"
            ${this.submitting ? 'disabled' : ''}
          >
            ${candidates.map(s => `
              <option value="${s.name}" ${s.name === this.primaryService ? 'selected' : ''}>
                ${s.name} (port: ${s.ports.join(', ')})
              </option>
            `).join('')}
          </select>
          <p class="text-muted" style="font-size: var(--text-xs); margin-top: var(--space-2)">
            Other services run on the internal compose network and aren't reachable from outside.
          </p>
        </div>
      ` : ''}

      ${this.renderSubdomainField()}

      <div class="form-group">
        <label class="form-label" for="env-text">Environment variables <span class="text-muted">(KEY=VALUE per line)</span></label>
        <textarea
          id="env-text"
          class="form-input compose-textarea"
          placeholder="API_URL=https://${this.subdomain || '<subdomain>'}.${this.domain}/&#10;DURATION_LIMIT=10800"
          ${this.submitting ? 'disabled' : ''}
          spellcheck="false"
        >${this.envText}</textarea>
        <p class="text-muted" style="font-size: var(--text-xs); margin-top: var(--space-2)">
          Merged into the primary service via an env_file.
        </p>
      </div>

      <div class="form-group">
        <label class="form-checkbox">
          <input
            type="checkbox"
            id="persistent-storage"
            ${this.persistentStorage ? 'checked' : ''}
            ${this.submitting ? 'disabled' : ''}
          />
          <span>Mount /data on the primary service (for persistent files like cookies.json)</span>
        </label>
      </div>

      ${this.renderSleepFields()}

      <p class="text-muted" style="font-size: var(--text-xs); margin-top: var(--space-3)">
        Note: redeploys do <code>compose pull + up -d</code> with brief downtime (no blue-green for compose v1).
      </p>
    `;
  }

  private renderSubdomainField(): string {
    return `
      <div class="form-group">
        <label class="form-label" for="subdomain">Subdomain</label>
        <div class="subdomain-row">
          <input
            type="text"
            id="subdomain"
            class="form-input"
            placeholder="my-site"
            value="${this.subdomain}"
            ${this.submitting ? 'disabled' : ''}
            pattern="[a-z0-9-]+"
            required
          />
          <span class="subdomain-suffix">.${this.domain}</span>
        </div>
        <p class="text-muted" style="font-size: var(--text-xs); margin-top: var(--space-2)">
          Lowercase letters, numbers, and hyphens only
        </p>
      </div>
    `;
  }

  private renderSleepFields(): string {
    return `
      <div class="form-group">
        <label class="form-checkbox">
          <input
            type="checkbox"
            id="sleep-enabled"
            ${this.sleepEnabled ? 'checked' : ''}
            ${this.submitting ? 'disabled' : ''}
          />
          <span>Enable sleep after inactivity</span>
        </label>
      </div>

      <div class="form-group">
        <label class="form-label" for="sleep-after">Sleep after</label>
        <select
          id="sleep-after"
          class="form-select"
          ${!this.sleepEnabled || this.submitting ? 'disabled' : ''}
        >
          <option value="" ${this.sleepAfterMinutes === '' ? 'selected' : ''}>Use server default</option>
          <option value="5" ${this.sleepAfterMinutes === '5' ? 'selected' : ''}>5 minutes</option>
          <option value="30" ${this.sleepAfterMinutes === '30' ? 'selected' : ''}>30 minutes</option>
          <option value="60" ${this.sleepAfterMinutes === '60' ? 'selected' : ''}>1 hour</option>
        </select>
      </div>
    `;
  }

  render() {
    const filteredRepos = this.getFilteredRepos();
    const showFooter = !(this.sourceType === 'github' && this.showRepoPicker);

    this.innerHTML = `
      <div class="modal-backdrop" id="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">New Site</h2>
            <button class="modal-close" id="close-btn">&times;</button>
          </div>

          <form id="new-site-form">
            <div class="modal-body">
              ${this.renderSourceSwitch()}
              ${this.sourceType === 'github'
                ? this.renderGithubBody(filteredRepos)
                : this.renderComposeBody()}
            </div>

            ${showFooter ? `
              <div class="modal-footer">
                <button
                  type="button"
                  class="btn"
                  id="cancel-btn"
                  ${this.submitting ? 'disabled' : ''}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  ${this.submitting ? 'disabled' : ''}
                >
                  ${this.submitting ? 'Creating...' : 'Create Site'}
                </button>
              </div>
            ` : ''}
          </form>
        </div>
      </div>

      <style>
        .source-switch {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-4);
          padding: var(--space-1);
          background: var(--bg-subtle, var(--bg));
          border: 1px solid var(--border);
        }
        .source-pill {
          flex: 1;
          padding: var(--space-2) var(--space-3);
          background: transparent;
          color: var(--muted);
          border: none;
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .source-pill:hover {
          color: var(--text);
        }
        .source-pill.active {
          background: var(--accent);
          color: #ffffff;
        }
        .compose-textarea {
          font-family: var(--font-mono);
          min-height: 9em;
          resize: vertical;
          white-space: pre;
        }
        .compose-fetch-row {
          display: flex;
          gap: var(--space-2);
        }
        .compose-fetch-row .form-input {
          flex: 1;
        }
        .text-error {
          color: var(--error, #d33);
        }
        .repo-list {
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid var(--border);
        }
        .repo-empty {
          padding: var(--space-5);
          text-align: center;
          color: var(--muted);
        }
        .repo-item {
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--border);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .repo-item:last-child {
          border-bottom: none;
        }
        .repo-item:hover {
          background: var(--accent);
          color: #ffffff;
        }
        .repo-name {
          font-weight: 600;
        }
        .repo-description {
          font-size: var(--text-xs);
          color: var(--muted);
          margin-top: var(--space-1);
        }
        .repo-item:hover .repo-description {
          color: rgba(255, 255, 255, 0.8);
        }
        .repo-meta {
          font-size: var(--text-xs);
          color: var(--faint);
          margin-top: var(--space-1);
        }
        .repo-item:hover .repo-meta {
          color: rgba(255, 255, 255, 0.7);
        }
        .form-select {
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          width: 100%;
        }
        .form-select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .subdomain-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .subdomain-row .form-input {
          flex: 1;
        }
        .subdomain-suffix {
          color: var(--muted);
          white-space: nowrap;
        }
      </style>
    `;

    this.attachListeners();
  }

  private attachListeners() {
    const form = this.querySelector('#new-site-form') as HTMLFormElement | null;
    form?.addEventListener('submit', (e) => this.handleSubmit(e));

    this.querySelectorAll<HTMLButtonElement>('.source-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const src = pill.getAttribute('data-source') as SourceType;
        if (src) this.setSourceType(src);
      });
    });

    // Github branch
    this.querySelector('#git-url')?.addEventListener('input', (e) => {
      this.handleGitUrlChange((e.target as HTMLInputElement).value);
    });
    this.querySelector('#toggle-repos-btn')?.addEventListener('click', () => this.toggleRepoPicker());
    this.querySelector('#repo-filter')?.addEventListener('input', (e) => {
      this.handleRepoFilterChange((e.target as HTMLInputElement).value);
    });
    this.querySelectorAll('.repo-item').forEach((item) => {
      item.addEventListener('click', () => {
        const cloneUrl = item.getAttribute('data-clone-url') || '';
        const name = item.getAttribute('data-name') || '';
        this.handleRepoSelect({ clone_url: cloneUrl, name } as GitHubRepo);
      });
    });

    // Compose branch
    const composeYaml = this.querySelector('#compose-yaml') as HTMLTextAreaElement | null;
    if (composeYaml) {
      composeYaml.addEventListener('input', (e) => {
        this.composeYaml = (e.target as HTMLTextAreaElement).value;
      });
      composeYaml.addEventListener('blur', () => {
        this.parseComposeFromYaml();
      });
    }
    this.querySelector('#compose-url')?.addEventListener('input', (e) => {
      this.composeUrl = (e.target as HTMLInputElement).value;
    });
    this.querySelector('#fetch-compose-btn')?.addEventListener('click', () => this.fetchComposeFromUrl());
    this.querySelector('#primary-service')?.addEventListener('change', (e) => {
      this.handlePrimaryServiceChange((e.target as HTMLSelectElement).value);
    });
    this.querySelector('#env-text')?.addEventListener('input', (e) => {
      this.envText = (e.target as HTMLTextAreaElement).value;
    });
    this.querySelector('#persistent-storage')?.addEventListener('change', (e) => {
      this.persistentStorage = (e.target as HTMLInputElement).checked;
    });

    // Shared
    this.querySelector('#subdomain')?.addEventListener('input', (e) => {
      this.handleSubdomainChange((e.target as HTMLInputElement).value);
    });
    this.querySelector('#sleep-enabled')?.addEventListener('change', (e) => {
      this.sleepEnabled = (e.target as HTMLInputElement).checked;
      this.render();
    });
    this.querySelector('#sleep-after')?.addEventListener('change', (e) => {
      this.sleepAfterMinutes = (e.target as HTMLSelectElement).value;
    });

    this.querySelector('#cancel-btn')?.addEventListener('click', () => this.handleCancel());
    this.querySelector('#close-btn')?.addEventListener('click', () => this.handleCancel());
    this.querySelector('#modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.handleCancel();
      }
    });
  }
}

customElements.define('deploy-new-site-modal', DeployNewSiteModal);
