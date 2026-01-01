// ABOUTME: Site card component displaying individual site in a row
// ABOUTME: Shows status dot, name, URL, action buttons, and dropdown menu

class DeploySiteCard extends HTMLElement {
  private dropdownOpen: boolean = false;

  static get observedAttributes() {
    return ['site-id', 'name', 'status', 'visibility', 'git-url', 'subdomain', 'domain', 'persistent-storage'];
  }

  get siteId(): string {
    return this.getAttribute('site-id') || '';
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

  get domain(): string {
    return this.getAttribute('domain') || '';
  }

  get persistentStorage(): boolean {
    return this.getAttribute('persistent-storage') === '1';
  }

  get siteUrl(): string {
    return `https://${this.subdomain}.${this.domain}`;
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
      const response = await fetch(`/api/sites/${this.siteId}/deploy`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
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

  handleViewLogs() {
    window.location.href = `/sites/${this.siteId}`;
  }

  handleOpenSite() {
    window.open(this.siteUrl, '_blank');
  }

  handleEnvironment() {
    window.location.href = `/sites/${this.siteId}?tab=environment`;
  }

  handleSettings() {
    window.location.href = `/sites/${this.siteId}?tab=settings`;
  }

  async handleTogglePersistentStorage() {
    const newValue = !this.persistentStorage;
    const action = newValue ? 'enable' : 'disable';

    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} persistent storage for ${this.siteName}? This requires a redeploy.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/sites/${this.siteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ persistent_storage: newValue })
      });

      if (response.ok) {
        window.dispatchEvent(new CustomEvent('site-updated'));
      } else {
        const error = await response.json();
        alert(`Failed to update: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Toggle persistent storage failed:', error);
      alert('Failed to update site');
    }
  }

  async handleDelete() {
    if (!confirm(`Delete ${this.siteName}? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/sites/${this.siteId}`, {
        method: 'DELETE',
        credentials: 'include'
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

  toggleDropdown(e: Event) {
    e.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;
    this.render();
  }

  render() {
    const showPublicBadge = this.visibility === 'public';

    this.innerHTML = `
      <div class="site-row">
        <div class="site-status ${this.status}"></div>

        <div class="site-info">
          <div class="site-name-row">
            <a href="/sites/${this.siteId}" class="site-name" data-route>${this.siteName}</a>
            ${showPublicBadge ? '<span class="site-badge">Public</span>' : ''}
          </div>
          <div class="site-url">${this.siteUrl}</div>
        </div>

        <div class="site-actions">
          <button class="btn btn-sm" id="logs-btn">Logs</button>
          <button class="btn btn-sm" id="redeploy-btn">Redeploy</button>
          <button class="btn btn-sm" id="open-btn">Open</button>

          <div class="dropdown ${this.dropdownOpen ? 'open' : ''}">
            <button class="dropdown-trigger" id="menu-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <div class="dropdown-menu">
              <button class="dropdown-item" id="env-btn">Environment</button>
              <button class="dropdown-item" id="storage-btn">
                ${this.persistentStorage ? 'Disable' : 'Enable'} Storage
              </button>
              <button class="dropdown-item" id="settings-btn">Settings</button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item danger" id="delete-btn">Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Attach event listeners
    this.querySelector('#logs-btn')?.addEventListener('click', () => this.handleViewLogs());
    this.querySelector('#redeploy-btn')?.addEventListener('click', () => this.handleRedeploy());
    this.querySelector('#open-btn')?.addEventListener('click', () => this.handleOpenSite());
    this.querySelector('#menu-btn')?.addEventListener('click', (e) => this.toggleDropdown(e));

    if (this.dropdownOpen) {
      this.querySelector('#env-btn')?.addEventListener('click', () => this.handleEnvironment());
      this.querySelector('#storage-btn')?.addEventListener('click', () => this.handleTogglePersistentStorage());
      this.querySelector('#settings-btn')?.addEventListener('click', () => this.handleSettings());
      this.querySelector('#delete-btn')?.addEventListener('click', () => this.handleDelete());
    }
  }
}

customElements.define('deploy-site-card', DeploySiteCard);
