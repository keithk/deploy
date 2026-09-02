// ABOUTME: CRT sites table displaying live deployment and resource state.
// ABOUTME: Supports site search, creation, log navigation, and redeployment.

import './site-card.js';
import './new-site-modal.js';
import { showToast } from './toast.js';

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

interface DeployGroup {
  id: string;
  name: string;
  sites: Array<Pick<Site, 'id' | 'name' | 'status'>>;
}

class DeploySites extends HTMLElement {
  private sites: Site[] = [];
  private groups: DeployGroup[] = [];
  private loading: boolean = true;
  private searchQuery: string = '';
  private showModal: boolean = false;
  private editingGroup: DeployGroup | null = null;
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
      const [sitesResponse, groupsResponse] = await Promise.all([
        fetch('/api/sites'),
        fetch('/api/deploy-groups'),
      ]);
      if (sitesResponse.ok) this.sites = await sitesResponse.json();
      if (groupsResponse.ok) this.groups = await groupsResponse.json();
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

  openGroupModal(group: DeployGroup | null = null) {
    this.editingGroup = group;
    this.render();
  }

  async saveGroup() {
    const name = (this.querySelector('#group-name') as HTMLInputElement)?.value.trim();
    const siteIds = Array.from(this.querySelectorAll<HTMLInputElement>('[data-group-site]:checked'))
      .map(input => input.value);
    if (!name) {
      showToast('Group name is required', 'error');
      return;
    }

    const group = this.editingGroup;
    const isEditing = Boolean(group?.id);
    const response = await fetch(isEditing ? `/api/deploy-groups/${group!.id}` : '/api/deploy-groups', {
      method: isEditing ? 'PATCH' : 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, site_ids: siteIds }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      showToast(body.error || 'Failed to save deploy group', 'error');
      return;
    }

    showToast(`Deploy group ${isEditing ? 'updated' : 'created'}`, 'success');
    this.editingGroup = null;
    await this.loadSites();
  }

  async deployGroup(group: DeployGroup) {
    const response = await fetch(`/api/deploy-groups/${group.id}/deploy`, {
      method: 'POST',
      credentials: 'include',
    });
    if (response.ok) {
      showToast(`Deploying ${group.sites.length} sites in ${group.name}`, 'success');
      window.dispatchEvent(new CustomEvent('site-updated'));
    } else {
      const body = await response.json().catch(() => ({}));
      showToast(body.error || 'Failed to deploy group', 'error');
    }
  }

  async deleteGroup(group: DeployGroup) {
    if (!window.confirm(`Delete deploy group “${group.name}”?`)) return;
    const response = await fetch(`/api/deploy-groups/${group.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) {
      showToast('Failed to delete deploy group', 'error');
      return;
    }
    showToast(`Deleted ${group.name}`, 'success');
    await this.loadSites();
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
      ${this.renderGroups()}

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
      ${this.editingGroup !== null ? this.renderGroupModal() : ''}
    `;

    // Attach event listeners
    this.querySelector('#new-site-btn')?.addEventListener('click', () => this.toggleModal());
    this.querySelector('#new-group-btn')?.addEventListener('click', () => this.openGroupModal({ id: '', name: '', sites: [] }));
    this.querySelectorAll<HTMLElement>('[data-group-deploy]').forEach(button => {
      button.addEventListener('click', () => {
        const group = this.groups.find(item => item.id === button.dataset.groupDeploy);
        if (group) void this.deployGroup(group);
      });
    });
    this.querySelectorAll<HTMLElement>('[data-group-edit]').forEach(button => {
      button.addEventListener('click', () => {
        const group = this.groups.find(item => item.id === button.dataset.groupEdit);
        if (group) this.openGroupModal(group);
      });
    });
    this.querySelectorAll<HTMLElement>('[data-group-delete]').forEach(button => {
      button.addEventListener('click', () => {
        const group = this.groups.find(item => item.id === button.dataset.groupDelete);
        if (group) void this.deleteGroup(group);
      });
    });
    this.querySelector('#save-group-btn')?.addEventListener('click', () => void this.saveGroup());
    this.querySelectorAll('#close-group-modal, #cancel-group-btn').forEach(button => {
      button.addEventListener('click', () => {
        this.editingGroup = null;
        this.render();
      });
    });
    this.querySelector('#group-modal-overlay')?.addEventListener('click', event => {
      if (event.target === event.currentTarget) {
        this.editingGroup = null;
        this.render();
      }
    });

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

  renderGroups(): string {
    return `
      <section class="terminal-frame deploy-groups-frame" aria-label="Deploy groups">
        <div class="terminal-frame-title">
          <span>┌─ DEPLOY GROUPS [${this.groups.length}]</span>
          <span class="terminal-frame-line" aria-hidden="true"></span>
          <button class="btn btn-primary" id="new-group-btn">+ GROUP</button>
          <span>─┐</span>
        </div>
        <div class="deploy-groups-list">
          ${this.groups.length === 0
            ? '<p class="deploy-groups-empty">&gt; NO DEPLOY GROUPS CONFIGURED</p>'
            : this.groups.map(group => `
              <div class="deploy-group-row">
                <span class="deploy-group-name">${this.escapeHtml(group.name)}</span>
                <span class="deploy-group-sites">${group.sites.length
                  ? group.sites.map(site => this.escapeHtml(site.name)).join(' · ')
                  : 'NO SITES'}</span>
                <span class="deploy-group-actions">
                  <button class="site-command" data-group-edit="${group.id}">[EDIT]</button>
                  <button class="site-command" data-group-delete="${group.id}">[DEL]</button>
                  <button class="site-command" data-group-deploy="${group.id}" ${group.sites.length === 0 ? 'disabled' : ''}>[DEPLOY ALL]</button>
                </span>
              </div>
            `).join('')}
        </div>
        <div class="terminal-frame-bottom"><span>└</span><span class="terminal-frame-line" aria-hidden="true"></span><span>┘</span></div>
      </section>
    `;
  }

  renderGroupModal(): string {
    const group = this.editingGroup!;
    const selected = new Set(group.sites.map(site => site.id));
    return `
      <div class="modal-backdrop" id="group-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="group-modal-title">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title" id="group-modal-title">${group.id ? 'Edit' : 'New'} Deploy Group</h2>
            <button class="modal-close" id="close-group-modal" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="group-name">Name</label>
              <input class="form-input" id="group-name" value="${this.escapeAttribute(group.name)}" placeholder="ATMOBB INSTANCES" autofocus>
            </div>
            <fieldset class="deploy-group-site-picker">
              <legend>Sites</legend>
              ${this.sites.length
                ? this.sites.map(site => `
                  <label class="form-checkbox">
                    <input type="checkbox" data-group-site value="${site.id}" ${selected.has(site.id) ? 'checked' : ''}>
                    <span>${this.escapeHtml(site.name)}</span>
                    <span class="deploy-group-site-status">${site.status.toUpperCase()}</span>
                  </label>
                `).join('')
                : '<p>NO SITES AVAILABLE</p>'}
            </fieldset>
          </div>
          <div class="modal-footer">
            <button class="btn" id="cancel-group-btn">CANCEL</button>
            <button class="btn btn-primary" id="save-group-btn">SAVE GROUP</button>
          </div>
        </div>
      </div>
    `;
  }

  escapeHtml(value: string): string {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
  }

  escapeAttribute(value: string): string {
    return this.escapeHtml(value).replace(/"/g, '&quot;');
  }
}

customElements.define('deploy-sites', DeploySites);
