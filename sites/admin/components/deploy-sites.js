class DeploySites extends HTMLElement {
  constructor() {
    super();
    this.sites = [];
  }

  connectedCallback() {
    this.render();
    this.loadSites();
  }

  async loadSites() {
    try {
      const response = await fetch('/api/sites');
      if (response.ok) {
        this.sites = await response.json();
        this.render();
      }
    } catch (error) {
      console.error('Failed to load sites:', error);
    }
  }

  async createSite(formData) {
    try {
      const response = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        this.loadSites(); // Refresh the list
        this.querySelector('#create-site-form').reset();
      } else {
        const error = await response.json();
        alert('Failed to create site: ' + error.error);
      }
    } catch (error) {
      console.error('Failed to create site:', error);
      alert('Failed to create site');
    }
  }

  async buildSite(siteName) {
    try {
      const response = await fetch(`/api/sites/${siteName}/build`, {
        method: 'POST'
      });
      
      if (response.ok) {
        alert('Site built successfully');
      } else {
        const error = await response.json();
        alert('Build failed: ' + error.error);
      }
    } catch (error) {
      console.error('Failed to build site:', error);
      alert('Failed to build site');
    }
  }

  render() {
    this.innerHTML = `
      <div class="sites-manager">
        <div class="flex justify-between items-center mb-4">
          <h1 style="font-size: 1.875rem; font-weight: 700;">Sites</h1>
          <button class="btn btn-primary" onclick="this.parentElement.parentElement.querySelector('#create-form').classList.toggle('hidden')">
            Create Site
          </button>
        </div>
        
        <!-- Create Site Form -->
        <div id="create-form" class="card hidden" style="margin-bottom: 1.5rem;">
          <div class="card-header">
            <h2>Create New Site</h2>
          </div>
          <div class="card-content">
            <form id="create-site-form" onsubmit="event.preventDefault(); this.parentElement.parentElement.parentElement.parentElement.createSite(new FormData(this));">
              <div class="form-group">
                <label class="form-label" for="site-name">Site Name</label>
                <input type="text" id="site-name" name="name" class="form-input" required placeholder="my-awesome-site">
              </div>
              
              <div class="form-group">
                <label class="form-label" for="site-type">Site Type</label>
                <select id="site-type" name="type" class="form-select">
                  <option value="static">Static</option>
                  <option value="static-build">Static Build</option>
                  <option value="dynamic">Dynamic</option>
                  <option value="passthrough">Passthrough</option>
                </select>
              </div>
              
              <div class="form-group">
                <label>
                  <input type="checkbox" name="force"> Force (overwrite existing)
                </label>
              </div>
              
              <div class="flex gap-2">
                <button type="submit" class="btn btn-primary">Create Site</button>
                <button type="button" class="btn btn-secondary" onclick="this.form.reset(); this.closest('#create-form').classList.add('hidden');">Cancel</button>
              </div>
            </form>
          </div>
        </div>
        
        <!-- Sites Table -->
        <div class="card">
          <div class="card-header">
            <h2>All Sites</h2>
          </div>
          <div class="card-content">
            ${this.renderSitesTable()}
          </div>
        </div>
      </div>
    `;

    // Bind event handlers
    this.bindEvents();
  }

  renderSitesTable() {
    if (this.sites.length === 0) {
      return '<p class="text-muted">No sites configured. Create your first site to get started.</p>';
    }

    return `
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Status</th>
            <th>Subdomain</th>
            <th>Port</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${this.sites.map(site => `
            <tr>
              <td><strong>${site.name || site.subdomain}</strong></td>
              <td>${site.type}</td>
              <td>
                <span class="status ${site.status === 'running' ? 'status-running' : 'status-stopped'}">
                  ${site.status || 'inactive'}
                </span>
              </td>
              <td>${site.subdomain}</td>
              <td>${site.port || '-'}</td>
              <td>
                <div class="flex gap-2">
                  <button class="btn btn-sm btn-secondary" onclick="this.closest('deploy-sites').buildSite('${site.name || site.subdomain}')">
                    Build
                  </button>
                  <a href="https://${site.subdomain}.${window.location.hostname.split('.').slice(-2).join('.')}" target="_blank" class="btn btn-sm btn-primary">
                    View
                  </a>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  bindEvents() {
    // Convert FormData to object for createSite method
    const form = this.querySelector('#create-site-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = {
          name: formData.get('name'),
          type: formData.get('type'),
          force: formData.get('force') === 'on'
        };
        this.createSite(data);
      });
    }
  }
}

customElements.define('deploy-sites', DeploySites);