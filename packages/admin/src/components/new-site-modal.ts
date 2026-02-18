// ABOUTME: Modal component for creating new sites
// ABOUTME: Supports GitHub repo picker or manual git URL entry

import { showToast } from './toast.js';

interface GitHubRepo {
  name: string;
  full_name: string;
  clone_url: string;
  description: string | null;
  private: boolean;
  updated_at: string;
}

class DeployNewSiteModal extends HTMLElement {
  private gitUrl: string = '';
  private subdomain: string = '';
  private submitting: boolean = false;
  private domain: string = '';
  private githubConfigured: boolean = false;
  private repos: GitHubRepo[] = [];
  private loadingRepos: boolean = false;
  private showRepoPicker: boolean = false;
  private repoFilter: string = '';
  private sleepEnabled: boolean = true;
  private sleepAfterMinutes: string = '';

  async connectedCallback() {
    await this.loadSettings();
    this.render();

    // Close on escape key
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
        const error = await res.json();
        showToast(error.error || 'Failed to load repos', 'error');
      }
    } catch (error) {
      console.error('Failed to load repos:', error);
      showToast('Failed to load repos', 'error');
    }

    this.loadingRepos = false;
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

  async handleSubmit(e: Event) {
    e.preventDefault();

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
          git_url: this.gitUrl,
          name: this.subdomain,
          sleep_enabled: this.sleepEnabled,
          sleep_after_minutes: this.sleepAfterMinutes === '' ? null : parseInt(this.sleepAfterMinutes, 10)
        })
      });

      if (response.ok) {
        this.dispatchEvent(new CustomEvent('site-created', {
          bubbles: true,
          detail: await response.json()
        }));
        this.dispatchEvent(new CustomEvent('close'));
        this.remove();
      } else {
        const error = await response.json();
        showToast(`Failed to create site: ${error.error || 'Unknown error'}`, 'error');
        this.submitting = false;
        this.render();
      }
    } catch (error) {
      console.error('Create site failed:', error);
      showToast('Failed to create site', 'error');
      this.submitting = false;
      this.render();
    }
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

  render() {
    const filteredRepos = this.getFilteredRepos();

    this.innerHTML = `
      <div class="modal-backdrop" id="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">New Site</h2>
            <button class="modal-close" id="close-btn">&times;</button>
          </div>

          <form id="new-site-form">
            <div class="modal-body">
              ${this.githubConfigured ? `
                <div class="form-group">
                  <button
                    type="button"
                    class="btn ${this.showRepoPicker ? '' : 'btn-primary'}"
                    id="toggle-repos-btn"
                    style="width: 100%"
                    ${this.submitting ? 'disabled' : ''}
                  >
                    ${this.showRepoPicker ? '\u2190 Back to form' : 'Select from GitHub'}
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
                        ${repo.private ? 'Private' : 'Public'} \u00B7 ${new Date(repo.updated_at).toLocaleDateString()}
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
              `}
            </div>

            ${!this.showRepoPicker ? `
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
        .repo-list {
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid var(--border);
        }
        .repo-empty {
          padding: var(--space-5);
          text-align: center;
          color: var(--text-muted);
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
          color: var(--text-muted);
          margin-top: var(--space-1);
        }
        .repo-item:hover .repo-description {
          color: rgba(255, 255, 255, 0.8);
        }
        .repo-meta {
          font-size: var(--text-xs);
          color: var(--text-faint);
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
          color: var(--text-muted);
          white-space: nowrap;
        }
      </style>
    `;

    // Attach event listeners
    const form = this.querySelector('#new-site-form') as HTMLFormElement;
    form?.addEventListener('submit', (e) => this.handleSubmit(e));

    this.querySelector('#git-url')?.addEventListener('input', (e) => {
      this.handleGitUrlChange((e.target as HTMLInputElement).value);
    });

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
    this.querySelector('#toggle-repos-btn')?.addEventListener('click', () => this.toggleRepoPicker());

    this.querySelector('#repo-filter')?.addEventListener('input', (e) => {
      this.handleRepoFilterChange((e.target as HTMLInputElement).value);
    });

    this.querySelectorAll('.repo-item').forEach(item => {
      item.addEventListener('click', () => {
        const cloneUrl = item.getAttribute('data-clone-url') || '';
        const name = item.getAttribute('data-name') || '';
        this.handleRepoSelect({ clone_url: cloneUrl, name } as GitHubRepo);
      });
    });

    this.querySelector('#modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.handleCancel();
      }
    });
  }
}

customElements.define('deploy-new-site-modal', DeployNewSiteModal);
