class DeploySites extends HTMLElement {
  constructor() {
    super();
    this.sites = [];
    this.showCreateForm = false;
    this.githubConfigured = false;
    this.showRepoPicker = false;
    this.repos = [];
    this.loadingRepos = false;
    this.repoFilter = '';
    this.formData = { git_url: '', name: '' };
    this.submitting = false;
  }

  connectedCallback() {
    this.loadSettings();
    this.loadSites();
  }

  async loadSettings() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const settings = await res.json();
        this.githubConfigured = settings.github_configured || false;
      }
    } catch (e) {
      console.error('failed to load settings:', e);
    }
  }

  async loadSites() {
    try {
      const response = await fetch('/api/sites');
      if (response.ok) {
        this.sites = await response.json();
        this.render();
      }
    } catch (error) {
      console.error('failed to load sites:', error);
      this.render();
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

  async createSite() {
    if (!this.formData.git_url || !this.formData.name) {
      alert('please fill in git url and name');
      return;
    }

    this.submitting = true;
    this.render();

    try {
      const response = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          git_url: this.formData.git_url,
          name: this.formData.name
        })
      });

      if (response.ok) {
        this.formData = { git_url: '', name: '' };
        this.showCreateForm = false;
        this.showRepoPicker = false;
        this.loadSites();
      } else {
        const error = await response.json();
        alert('failed to create site: ' + (error.error || 'unknown error'));
      }
    } catch (error) {
      console.error('failed to create site:', error);
      alert('failed to create site');
    }

    this.submitting = false;
    this.render();
  }

  selectRepo(repo) {
    this.formData.git_url = repo.clone_url;
    this.formData.name = this.suggestName(repo.name);
    this.showRepoPicker = false;
    this.render();
  }

  suggestName(repoName) {
    return repoName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');
  }

  getFilteredRepos() {
    if (!this.repoFilter) return this.repos;
    const filter = this.repoFilter.toLowerCase();
    return this.repos.filter(repo =>
      repo.name.toLowerCase().includes(filter) ||
      (repo.description && repo.description.toLowerCase().includes(filter))
    );
  }

  render() {
    const filteredRepos = this.getFilteredRepos();

    this.innerHTML = `
      <div class="sites-manager">
        <div class="flex justify-between items-center mb-4">
          <h2>sites</h2>
          <button class="btn btn-primary" id="toggle-create-btn">
            ${this.showCreateForm ? 'cancel' : 'create site'}
          </button>
        </div>

        ${this.showCreateForm ? `
          <div class="card" style="margin-bottom: 1.5rem;">
            <div class="card-header">
              <h2>create new site</h2>
            </div>
            <div class="card-content">
              ${this.githubConfigured ? `
                <div class="form-group">
                  <button type="button" class="btn ${this.showRepoPicker ? 'btn-primary' : ''}" id="toggle-repos-btn" style="width: 100%;" ${this.submitting ? 'disabled' : ''}>
                    ${this.showRepoPicker ? '← back to form' : 'select from github'}
                  </button>
                </div>
              ` : ''}

              ${this.showRepoPicker ? `
                <div class="form-group">
                  <input type="text" class="form-input" placeholder="filter repos..." id="repo-filter" value="${this.repoFilter}" />
                </div>
                <div class="repo-list" style="max-height: 300px; overflow-y: auto; border: 3px solid var(--black);">
                  ${this.loadingRepos ? `
                    <div style="padding: 1rem; text-align: center; color: var(--gray);">loading repos...</div>
                  ` : filteredRepos.length === 0 ? `
                    <div style="padding: 1rem; text-align: center; color: var(--gray);">no repos found</div>
                  ` : filteredRepos.map(repo => `
                    <div class="repo-item" data-clone-url="${repo.clone_url}" data-name="${repo.name}" style="padding: 0.75rem 1rem; border-bottom: 2px solid var(--black); cursor: pointer;">
                      <div style="font-weight: 700;">${repo.name}</div>
                      ${repo.description ? `<div style="font-size: 0.75rem; color: var(--gray); margin-top: 0.25rem;">${repo.description}</div>` : ''}
                      <div style="font-size: 0.625rem; color: var(--gray); margin-top: 0.25rem;">
                        ${repo.private ? 'private' : 'public'} · updated ${new Date(repo.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <form id="create-site-form">
                  <div class="form-group">
                    <label class="form-label" for="git-url">git url</label>
                    <input type="text" id="git-url" class="form-input" required placeholder="https://github.com/user/repo.git" value="${this.formData.git_url}" ${this.submitting ? 'disabled' : ''} />
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="site-name">subdomain</label>
                    <input type="text" id="site-name" class="form-input" required placeholder="my-site" pattern="[a-z0-9-]+" value="${this.formData.name}" ${this.submitting ? 'disabled' : ''} />
                    <small class="text-muted" style="font-size: 0.75rem; display: block; margin-top: 0.5rem;">lowercase letters, numbers, and hyphens only</small>
                  </div>

                  <div class="flex gap-2">
                    <button type="submit" class="btn btn-primary" ${this.submitting ? 'disabled' : ''}>
                      ${this.submitting ? 'creating...' : 'create site'}
                    </button>
                  </div>
                </form>
              `}
            </div>
          </div>
        ` : ''}

        <div class="card">
          <div class="card-header">
            <h2>all sites</h2>
          </div>
          <div class="card-content">
            ${this.renderSitesTable()}
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  renderSitesTable() {
    if (this.sites.length === 0) {
      return '<p class="text-muted">no sites configured. create your first site to get started.</p>';
    }

    return `
      <table class="table">
        <thead>
          <tr>
            <th>name</th>
            <th>status</th>
            <th>actions</th>
          </tr>
        </thead>
        <tbody>
          ${this.sites.map(site => `
            <tr>
              <td>
                <strong>${site.name || site.subdomain}</strong>
                ${site.git_url ? `<div style="font-size: 0.75rem; color: var(--gray);">${site.git_url}</div>` : ''}
              </td>
              <td>
                <span class="status ${site.status === 'running' ? 'status-running' : 'status-stopped'}">
                  ${site.status || 'stopped'}
                </span>
              </td>
              <td>
                <div class="flex gap-2">
                  <button class="btn btn-sm" data-deploy="${site.id}">deploy</button>
                  <button class="btn btn-sm" data-delete="${site.id}">delete</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  bindEvents() {
    // Toggle create form
    const toggleBtn = this.querySelector('#toggle-create-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.showCreateForm = !this.showCreateForm;
        this.showRepoPicker = false;
        this.render();
      });
    }

    // Toggle repo picker
    const toggleReposBtn = this.querySelector('#toggle-repos-btn');
    if (toggleReposBtn) {
      toggleReposBtn.addEventListener('click', () => {
        this.showRepoPicker = !this.showRepoPicker;
        if (this.showRepoPicker && this.repos.length === 0) {
          this.loadRepos();
        } else {
          this.render();
        }
      });
    }

    // Repo filter
    const repoFilter = this.querySelector('#repo-filter');
    if (repoFilter) {
      repoFilter.addEventListener('input', (e) => {
        this.repoFilter = e.target.value;
        this.render();
        // Refocus after render
        this.querySelector('#repo-filter')?.focus();
      });
    }

    // Repo items
    const repoItems = this.querySelectorAll('.repo-item');
    repoItems.forEach(item => {
      item.addEventListener('click', () => {
        const cloneUrl = item.getAttribute('data-clone-url');
        const name = item.getAttribute('data-name');
        this.selectRepo({ clone_url: cloneUrl, name });
      });
      item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--black)';
        item.style.color = 'var(--white)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = '';
        item.style.color = '';
      });
    });

    // Form inputs
    const gitUrlInput = this.querySelector('#git-url');
    if (gitUrlInput) {
      gitUrlInput.addEventListener('input', (e) => {
        this.formData.git_url = e.target.value;
        if (e.target.value && !this.formData.name) {
          this.formData.name = this.suggestName(e.target.value.split('/').pop().replace('.git', ''));
          this.render();
          this.querySelector('#git-url')?.focus();
        }
      });
    }

    const nameInput = this.querySelector('#site-name');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        this.formData.name = e.target.value;
      });
    }

    // Form submit
    const form = this.querySelector('#create-site-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.createSite();
      });
    }

    // Deploy buttons
    this.querySelectorAll('[data-deploy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const siteId = btn.getAttribute('data-deploy');
        btn.disabled = true;
        btn.textContent = 'deploying...';
        try {
          const res = await fetch(`/api/sites/${siteId}/deploy`, { method: 'POST' });
          if (res.ok) {
            alert('deployment started');
          } else {
            alert('deployment failed');
          }
        } catch (e) {
          alert('deployment failed');
        }
        btn.disabled = false;
        btn.textContent = 'deploy';
      });
    });

    // Delete buttons
    this.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('delete this site?')) return;
        const siteId = btn.getAttribute('data-delete');
        try {
          const res = await fetch(`/api/sites/${siteId}`, { method: 'DELETE' });
          if (res.ok) {
            this.loadSites();
          } else {
            alert('failed to delete');
          }
        } catch (e) {
          alert('failed to delete');
        }
      });
    });
  }
}

customElements.define('deploy-sites', DeploySites);
