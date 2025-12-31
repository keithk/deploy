// ABOUTME: Modal component for creating new sites
// ABOUTME: Auto-suggests subdomain from git URL and posts to /api/sites

class DeployNewSiteModal extends HTMLElement {
  private gitUrl: string = '';
  private subdomain: string = '';
  private submitting: boolean = false;
  private domain: string = '';

  async connectedCallback() {
    await this.loadDomain();
    this.render();
  }

  async loadDomain() {
    try {
      const res = await fetch('/api/settings');
      const settings = await res.json();
      this.domain = settings.domain || window.location.hostname;
    } catch {
      this.domain = window.location.hostname;
    }
  }

  handleGitUrlChange(url: string) {
    this.gitUrl = url;

    // Auto-suggest subdomain from git URL
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

  suggestSubdomain(gitUrl: string): string {
    try {
      // Extract repo name from git URL
      // Examples:
      // - https://github.com/user/my-site.git -> my-site
      // - git@github.com:user/my-site.git -> my-site
      // - https://github.com/user/my-site -> my-site

      let repoName = gitUrl;

      // Remove .git extension
      repoName = repoName.replace(/\.git$/, '');

      // Extract last part of path
      const parts = repoName.split('/');
      repoName = parts[parts.length - 1];

      // Clean up and make it a valid subdomain
      repoName = repoName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/--+/g, '-')
        .replace(/^-|-$/g, '');

      return repoName;
    } catch (error) {
      return '';
    }
  }

  async handleSubmit(e: Event) {
    e.preventDefault();

    if (!this.gitUrl || !this.subdomain) {
      alert('Please fill in all fields');
      return;
    }

    this.submitting = true;
    this.render();

    try {
      const response = await fetch('/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          git_url: this.gitUrl,
          name: this.subdomain
        })
      });

      if (response.ok) {
        // Dispatch event to parent component
        this.dispatchEvent(new CustomEvent('site-created', {
          bubbles: true,
          detail: await response.json()
        }));
        this.remove();
      } else {
        const error = await response.json();
        alert(`Failed to create site: ${error.message || 'Unknown error'}`);
        this.submitting = false;
        this.render();
      }
    } catch (error) {
      console.error('Create site failed:', error);
      alert('Failed to create site');
      this.submitting = false;
      this.render();
    }
  }

  handleCancel() {
    this.remove();
  }

  render() {
    this.innerHTML = `
      <div class="modal" id="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">Create New Site</h2>
          </div>

          <form id="new-site-form">
            <div class="form-group">
              <label class="form-label" for="git-url">
                Git URL
              </label>
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
              <label class="form-label" for="subdomain">
                Subdomain
              </label>
              <div style="display: flex; align-items: center; gap: var(--size-1);">
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
                <span class="text-muted" style="font-family: var(--font-mono); white-space: nowrap;">.${this.domain}</span>
              </div>
              <small class="text-muted" style="font-size: var(--font-size-00); display: block; margin-top: var(--size-1);">
                Lowercase letters, numbers, and hyphens only
              </small>
            </div>

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

    // Close modal when clicking overlay
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
