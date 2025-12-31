// ABOUTME: Sites list component that fetches and displays all sites
// ABOUTME: Shows loading state, search input, and new site button

import './site-card.js';
import './new-site-modal.js';

interface Site {
  id: string;
  name: string;
  subdomain?: string;
  status: 'running' | 'stopped' | 'building' | 'error';
  visibility?: 'public' | 'private';
  gitUrl?: string;
  url?: string;
}

class DeploySites extends HTMLElement {
  private sites: Site[] = [];
  private loading: boolean = true;
  private searchQuery: string = '';
  private showModal: boolean = false;

  connectedCallback() {
    this.render();
    this.loadSites();
    this.addEventListener('site-created', () => this.handleSiteCreated());
  }

  async loadSites() {
    this.loading = true;
    this.render();

    try {
      const response = await fetch('/api/sites');
      if (response.ok) {
        this.sites = await response.json();
      }
    } catch (error) {
      console.error('Failed to load sites:', error);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  handleSiteCreated() {
    this.showModal = false;
    this.loadSites();
  }

  handleSearch(query: string) {
    this.searchQuery = query;
    this.render();
  }

  toggleModal() {
    this.showModal = !this.showModal;
    this.render();
  }

  get filteredSites(): Site[] {
    if (!this.searchQuery) return this.sites;
    const query = this.searchQuery.toLowerCase();
    return this.sites.filter(site =>
      site.name.toLowerCase().includes(query) ||
      (site.subdomain && site.subdomain.toLowerCase().includes(query)) ||
      (site.gitUrl && site.gitUrl.toLowerCase().includes(query))
    );
  }

  render() {
    this.innerHTML = `
      <div class="sites-section">
        <div class="flex items-center justify-between mb-4">
          <h2 style="font-size: var(--font-size-4); font-weight: 600; color: var(--text-1);">
            Sites
          </h2>
          <button class="btn btn-primary" id="new-site-btn">
            + New
          </button>
        </div>

        <div class="mb-4">
          <input
            type="text"
            class="form-input"
            placeholder="Search sites..."
            id="search-input"
            value="${this.searchQuery}"
          />
        </div>

        <div class="sites-list">
          ${this.renderContent()}
        </div>
      </div>
    `;

    // Attach event listeners
    const newBtn = this.querySelector('#new-site-btn');
    if (newBtn) {
      newBtn.addEventListener('click', () => this.toggleModal());
    }

    const searchInput = this.querySelector('#search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch((e.target as HTMLInputElement).value);
      });
    }

    // Render modal if needed
    if (this.showModal) {
      const modal = document.createElement('deploy-new-site-modal');
      this.appendChild(modal);
    }
  }

  renderContent(): string {
    if (this.loading) {
      return '<p class="text-muted">Loading sites...</p>';
    }

    const sites = this.filteredSites;

    if (sites.length === 0) {
      return `
        <div class="card" style="text-align: center; padding: var(--size-5);">
          <p class="text-muted">
            ${this.searchQuery ? 'No sites found matching your search.' : 'No sites yet. Create your first site to get started.'}
          </p>
        </div>
      `;
    }

    return sites.map(site => `
      <deploy-site-card
        id="${site.id}"
        name="${site.name}"
        status="${site.status}"
        visibility="${site.visibility || 'public'}"
        git-url="${site.gitUrl || ''}"
        subdomain="${site.subdomain || site.name}"
      ></deploy-site-card>
    `).join('');
  }
}

customElements.define('deploy-sites', DeploySites);
