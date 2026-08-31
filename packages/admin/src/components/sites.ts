// ABOUTME: CRT sites table displaying live deployment and resource state.
// ABOUTME: Supports site search, creation, log navigation, and redeployment.

import './site-card.js';
import './new-site-modal.js';

interface Site {
  id: string;
  name: string;
  subdomain?: string;
  status: 'running' | 'stopped' | 'building' | 'error' | 'sleeping';
  visibility?: 'public' | 'private';
  gitUrl?: string;
  git_url?: string;
  url?: string;
  persistent_storage?: number;
  cpu_pct?: number | null;
  mem_pct?: number | null;
  last_deployed_at?: string | null;
}

class DeploySites extends HTMLElement {
  private sites: Site[] = [];
  private loading: boolean = true;
  private searchQuery: string = '';
  private showModal: boolean = false;
  private handleSiteUpdated = () => this.loadSites();
  private handleSiteDeleted = () => this.loadSites();

  connectedCallback() {
    this.render();
    this.loadSites();
    this.addEventListener('site-created', () => this.handleSiteCreated());
    window.addEventListener('site-updated', this.handleSiteUpdated);
    window.addEventListener('site-deleted', this.handleSiteDeleted);
  }

  disconnectedCallback() {
    window.removeEventListener('site-updated', this.handleSiteUpdated);
    window.removeEventListener('site-deleted', this.handleSiteDeleted);
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
    const sitesList = this.querySelector<HTMLElement>('.sites-list');
    if (sitesList) {
      sitesList.innerHTML = this.renderContent(this.getDomain());
    }

    const filterCount = this.querySelector<HTMLElement>('.sites-filter-count');
    if (filterCount) {
      filterCount.textContent = `SHOWING ${this.filteredSites.length} OF ${this.sites.length} SITES`;
      filterCount.classList.toggle('is-hidden', !query);
    }
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
      site.subdomain?.toLowerCase().includes(query) ||
      site.gitUrl?.toLowerCase().includes(query) ||
      site.git_url?.toLowerCase().includes(query)
    );
  }

  getDomain(): string {
    return window.location.hostname.split('.').slice(-2).join('.');
  }

  render() {
    const domain = this.getDomain();
    const visibleCount = this.filteredSites.length;

    this.innerHTML = `
      <section class="terminal-frame sites-frame" aria-label="Sites">
        <div class="terminal-frame-title">
          <span>┌─ SITES [${this.sites.length}]</span>
          <span class="terminal-frame-line" aria-hidden="true"></span>
          <div class="site-list-tools">
            <input
              type="search"
              class="search-input"
              placeholder="SEARCH SITES..."
              aria-label="Search sites"
              id="search-input"
              value="${this.searchQuery}"
            />
            <button class="btn btn-primary" id="new-site-btn">+ NEW</button>
          </div>
          <span>─┐</span>
        </div>

        <div class="sites-table-scroll">
          <div class="sites-table">
            <div class="sites-table-header" aria-hidden="true">
              <span></span><span>NAME</span><span>STATE</span><span>CPU</span><span>MEM</span><span>LAST DEPLOY</span><span></span>
            </div>
            <div class="sites-list">
              ${this.renderContent(domain)}
            </div>
          </div>
        </div>
        <div class="terminal-frame-bottom"><span>└</span><span class="terminal-frame-line" aria-hidden="true"></span><span>┘</span></div>
      </section>

      <p class="sites-filter-count ${this.searchQuery ? '' : 'is-hidden'}">SHOWING ${visibleCount} OF ${this.sites.length} SITES</p>

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
        <div class="sites-empty">
          <p>&gt; SCANNING DEPLOYMENTS<span class="loading-ellipsis">...</span></p>
        </div>
      `;
    }

    const sites = this.filteredSites;

    if (sites.length === 0) {
      return `
        <div class="sites-empty">
          <p>&gt; ${this.searchQuery ? 'NO SITES MATCH QUERY' : 'NO SITES CONFIGURED'}</p>
          <p>${this.searchQuery ? 'TRY A DIFFERENT SEARCH TERM' : 'SELECT + NEW TO INITIALIZE A DEPLOYMENT'}</p>
        </div>
      `;
    }

    return sites.map(site => `
      <deploy-site-card
        site-id="${site.id}"
        name="${site.name}"
        status="${site.status}"
        visibility="${site.visibility || 'public'}"
        git-url="${site.gitUrl || site.git_url || ''}"
        subdomain="${site.subdomain || site.name}"
        domain="${domain}"
        persistent-storage="${site.persistent_storage || 0}"
        cpu-pct="${site.cpu_pct ?? ''}"
        mem-pct="${site.mem_pct ?? ''}"
        last-deployed-at="${site.last_deployed_at || ''}"
      ></deploy-site-card>
    `).join('');
  }
}

customElements.define('deploy-sites', DeploySites);
