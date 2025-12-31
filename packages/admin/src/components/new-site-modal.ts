// ABOUTME: Modal component for creating new sites
// ABOUTME: Supports GitHub repo picker or manual git URL entry

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

  async connectedCallback() {
    await this.loadSettings();
    this.render();
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
        alert(error.error || 'failed to load repos');
      }
    } catch (error) {
      console.error('failed to load repos:', error);
      alert('failed to load repos');
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
      alert('please fill in all fields');
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
          name: this.subdomain
        })
      });

      if (response.ok) {
        this.dispatchEvent(new CustomEvent('site-created', {
          bubbles: true,
          detail: await response.json()
        }));
        this.remove();
      } else {
        const error = await response.json();
        alert(`failed to create site: ${error.error || 'unknown error'}`);
        this.submitting = false;
        this.render();
      }
    } catch (error) {
      console.error('create site failed:', error);
      alert('failed to create site');
      this.submitting = false;
      this.render();
    }
  }

  handleCancel() {
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
      <div class="modal" id="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">create new site</h2>
          </div>

          <form id="new-site-form">
            ${this.githubConfigured ? `
              <div class="form-group">
                <button
                  type="button"
                  class="btn ${this.showRepoPicker ? 'btn-primary' : ''}"
                  id="toggle-repos-btn"
                  style="width: 100%;"
                  ${this.submitting ? 'disabled' : ''}
                >
                  ${this.showRepoPicker ? '← back to form' : 'select from github'}
                </button>
              </div>
            ` : ''}

            ${this.showRepoPicker ? `
              <div class="form-group">
                <input
                  type="text"
                  class="form-input"
                  placeholder="filter repos..."
                  id="repo-filter"
                  value="${this.repoFilter}"
                />
              </div>
              <div class="repo-list" style="max-height: 300px; overflow-y: auto; border: 3px solid var(--black);">
                ${this.loadingRepos ? `
                  <div class="loading">loading repos...</div>
                ` : filteredRepos.length === 0 ? `
                  <div style="padding: 1rem; text-align: center; color: var(--gray);">no repos found</div>
                ` : filteredRepos.map(repo => `
                  <div class="repo-item" data-clone-url="${repo.clone_url}" data-name="${repo.name}" style="
                    padding: 0.75rem 1rem;
                    border-bottom: 2px solid var(--black);
                    cursor: pointer;
                  ">
                    <div style="font-weight: 700;">${repo.name}</div>
                    ${repo.description ? `<div style="font-size: 0.75rem; color: var(--gray); margin-top: 0.25rem;">${repo.description}</div>` : ''}
                    <div style="font-size: 0.625rem; color: var(--gray); margin-top: 0.25rem;">
                      ${repo.private ? 'private' : 'public'} · updated ${new Date(repo.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="form-group">
                <label class="form-label" for="git-url">git url</label>
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
                <label class="form-label" for="subdomain">subdomain</label>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <input
                    type="text"
                    id="subdomain"
                    class="form-input"
                    placeholder="my-site"
                    value="${this.subdomain}"
                    ${this.submitting ? 'disabled' : ''}
                    pattern="[a-z0-9-]+"
                    required
                    style="flex: 1;"
                  />
                  <span class="text-muted" style="white-space: nowrap;">.${this.domain}</span>
                </div>
                <small class="text-muted" style="font-size: 0.75rem; display: block; margin-top: 0.5rem;">
                  lowercase letters, numbers, and hyphens only
                </small>
              </div>

              <div class="modal-footer">
                <button
                  type="button"
                  class="btn"
                  id="cancel-btn"
                  ${this.submitting ? 'disabled' : ''}
                >
                  cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  ${this.submitting ? 'disabled' : ''}
                >
                  ${this.submitting ? 'creating...' : 'create site'}
                </button>
              </div>
            `}
          </form>
        </div>
      </div>
    `;

    // Attach event listeners
    const form = this.querySelector('#new-site-form') as HTMLFormElement;
    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    const gitUrlInput = this.querySelector('#git-url') as HTMLInputElement;
    if (gitUrlInput) {
      gitUrlInput.addEventListener('input', (e) => {
        this.handleGitUrlChange((e.target as HTMLInputElement).value);
      });
    }

    const subdomainInput = this.querySelector('#subdomain') as HTMLInputElement;
    if (subdomainInput) {
      subdomainInput.addEventListener('input', (e) => {
        this.handleSubdomainChange((e.target as HTMLInputElement).value);
      });
    }

    const cancelBtn = this.querySelector('#cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.handleCancel());
    }

    const toggleReposBtn = this.querySelector('#toggle-repos-btn');
    if (toggleReposBtn) {
      toggleReposBtn.addEventListener('click', () => this.toggleRepoPicker());
    }

    const repoFilterInput = this.querySelector('#repo-filter') as HTMLInputElement;
    if (repoFilterInput) {
      repoFilterInput.addEventListener('input', (e) => {
        this.handleRepoFilterChange((e.target as HTMLInputElement).value);
      });
    }

    // Repo item click handlers
    const repoItems = this.querySelectorAll('.repo-item');
    repoItems.forEach(item => {
      item.addEventListener('click', () => {
        const cloneUrl = item.getAttribute('data-clone-url') || '';
        const name = item.getAttribute('data-name') || '';
        this.handleRepoSelect({ clone_url: cloneUrl, name } as GitHubRepo);
      });
      item.addEventListener('mouseenter', () => {
        (item as HTMLElement).style.background = 'var(--black)';
        (item as HTMLElement).style.color = 'var(--white)';
      });
      item.addEventListener('mouseleave', () => {
        (item as HTMLElement).style.background = '';
        (item as HTMLElement).style.color = '';
      });
    });

    const overlay = this.querySelector('#modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.handleCancel();
        }
      });
    }
  }
}

customElements.define('deploy-new-site-modal', DeployNewSiteModal);
