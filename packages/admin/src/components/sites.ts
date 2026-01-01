// ABOUTME: Sites list component displaying all deployed sites
// ABOUTME: Shows status, name, URL, and action buttons in exe.dev style rows

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
  persistent_storage?: number;
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
    window.addEventListener('site-updated', () => this.loadSites());
    window.addEventListener('site-deleted', () => this.loadSites());
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

  getDomain(): string {
    return window.location.hostname.split('.').slice(-2).join('.');
  }

  render() {
    const domain = this.getDomain();

    this.innerHTML = `
      <div class="page-header">
        <div class="flex items-center gap-3">
          <h1 class="page-title">My Sites</h1>
          <button class="btn btn-primary" id="new-site-btn">+ New</button>
        </div>
        <div class="page-actions">
          <input
            type="text"
            class="search-input"
            placeholder="Search sites..."
            id="search-input"
            value="${this.searchQuery}"
          />
        </div>
      </div>

      <div class="sites-list">
        ${this.renderContent(domain)}
      </div>

      ${this.showModal ? '<deploy-new-site-modal></deploy-new-site-modal>' : ''}
    `;

    // Attach event listeners
    this.querySelector('#new-site-btn')?.addEventListener('click', () => this.toggleModal());

    const searchInput = this.querySelector('#search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      this.handleSearch((e.target as HTMLInputElement).value);
    });

    // Close modal on backdrop click or escape
    const modal = this.querySelector('deploy-new-site-modal');
    if (modal) {
      modal.addEventListener('close', () => {
        this.showModal = false;
        this.render();
      });
    }
  }

  renderContent(domain: string): string {
    if (this.loading) {
      return `
        <div class="empty-state">
          <p>Loading sites...</p>
        </div>
      `;
    }

    const sites = this.filteredSites;

    if (sites.length === 0) {
      return `
        <div class="empty-state">
          <p class="empty-state-title">
            ${this.searchQuery ? 'No sites found' : 'No sites yet'}
          </p>
          <p>
            ${this.searchQuery ? 'Try a different search term.' : 'Create your first site to get started.'}
          </p>
        </div>
      `;
    }

    return sites.map(site => `
      <deploy-site-card
        site-id="${site.id}"
        name="${site.name}"
        status="${site.status}"
        visibility="${site.visibility || 'public'}"
        git-url="${site.gitUrl || ''}"
        subdomain="${site.subdomain || site.name}"
        domain="${domain}"
        persistent-storage="${site.persistent_storage || 0}"
      ></deploy-site-card>
    `).join('');
  }
}

customElements.define('deploy-sites', DeploySites);
