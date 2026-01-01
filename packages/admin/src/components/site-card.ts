// ABOUTME: Site card component displaying individual site information
// ABOUTME: Shows status dot, name, URL, actions (Logs/Redeploy), and dropdown menu

class DeploySiteCard extends HTMLElement {
  private dropdownOpen: boolean = false;

  static get observedAttributes() {
    return ['id', 'name', 'status', 'visibility', 'git-url', 'subdomain'];
  }

  get siteId(): string {
    return this.getAttribute('id') || '';
  }

  get siteName(): string {
    return this.getAttribute('name') || '';
  }

  get status(): string {
    return this.getAttribute('status') || 'stopped';
  }

  get visibility(): string {
    return this.getAttribute('visibility') || 'public';
  }

  get gitUrl(): string {
    return this.getAttribute('git-url') || '';
  }

  get subdomain(): string {
    return this.getAttribute('subdomain') || '';
  }

  get siteUrl(): string {
    // Get domain from window location or use subdomain
    const domain = window.location.hostname.split('.').slice(-2).join('.');
    return `https://${this.subdomain}.${domain}`;
  }

  connectedCallback() {
    this.render();

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.contains(e.target as Node) && this.dropdownOpen) {
        this.dropdownOpen = false;
        this.render();
      }
    });
  }

  async handleRedeploy() {
    try {
      const response = await fetch(`/api/sites/${this.siteId}/redeploy`, {
        method: 'POST'
      });

      if (response.ok) {
        alert('Redeployment started');
        window.dispatchEvent(new CustomEvent('site-updated'));
      } else {
        const error = await response.json();
        alert(`Failed to redeploy: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Redeploy failed:', error);
      alert('Failed to redeploy site');
    }
  }

  handleLogs() {
    window.location.href = `/sites/${this.siteId}/logs`;
  }

  handleViewSite() {
    window.open(this.siteUrl, '_blank');
  }

  handleEnvironment() {
    window.location.href = `/sites/${this.siteId}/environment`;
  }

  handleShareLink() {
    navigator.clipboard.writeText(this.siteUrl);
    alert('Link copied to clipboard');
  }

  async handleDelete() {
    if (!confirm(`Are you sure you want to delete ${this.siteName}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/sites/${this.siteId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        window.dispatchEvent(new CustomEvent('site-deleted'));
      } else {
        const error = await response.json();
        alert(`Failed to delete: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete site');
    }
  }

  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
    this.render();
  }

  render() {
    this.innerHTML = `
      <div class="card">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 site-card-info">
            <span class="status-dot ${this.status}">
              ${this.status}
            </span>

            <div class="site-card-details">
              <h3 class="site-card-name">
                ${this.siteName}
              </h3>
              <a href="${this.siteUrl}" target="_blank" class="site-card-url text-muted">
                ${this.siteUrl}
              </a>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button class="btn btn-sm" id="logs-btn">
              Logs
            </button>
            <button class="btn btn-sm" id="redeploy-btn">
              Redeploy
            </button>

            <div class="dropdown">
              <button class="btn btn-sm" id="menu-btn">
                ⋮
              </button>
              ${this.dropdownOpen ? `
                <div class="dropdown-menu">
                  <button class="dropdown-item" id="view-site-btn">View Site</button>
                  <button class="dropdown-item" id="environment-btn">Environment</button>
                  <button class="dropdown-item" id="share-link-btn">Share Link</button>
                  <button class="dropdown-item danger" id="delete-btn">Delete</button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>

      <style>
        .site-card-info {
          flex: 1;
        }
        .site-card-details {
          flex: 1;
        }
        .site-card-name {
          font-size: var(--font-size-2);
          font-weight: 400;
          color: var(--text-1);
          margin-bottom: var(--size-1);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .site-card-url {
          font-size: var(--font-size-0);
        }
      </style>
    `;

    // Attach event listeners
    this.querySelector('#logs-btn')?.addEventListener('click', () => this.handleLogs());
    this.querySelector('#redeploy-btn')?.addEventListener('click', () => this.handleRedeploy());
    this.querySelector('#menu-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    if (this.dropdownOpen) {
      this.querySelector('#view-site-btn')?.addEventListener('click', () => this.handleViewSite());
      this.querySelector('#environment-btn')?.addEventListener('click', () => this.handleEnvironment());
      this.querySelector('#share-link-btn')?.addEventListener('click', () => this.handleShareLink());
      this.querySelector('#delete-btn')?.addEventListener('click', () => this.handleDelete());
    }
  }
}

customElements.define('deploy-site-card', DeploySiteCard);
