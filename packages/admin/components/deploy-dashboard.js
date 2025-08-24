class DeployDashboard extends HTMLElement {
  constructor() {
    super();
    this.data = {
      sites: [],
      processes: [],
      serverStatus: 'unknown'
    };
  }

  connectedCallback() {
    this.render();
    this.loadData();
  }

  async loadData() {
    try {
      // Load sites data
      const sitesResponse = await fetch('/api/sites');
      if (sitesResponse.ok) {
        this.data.sites = await sitesResponse.json();
      }

      // Load processes data  
      const processesResponse = await fetch('/api/processes');
      if (processesResponse.ok) {
        this.data.processes = await processesResponse.json();
      }

      // Load server status
      const healthResponse = await fetch('/health');
      this.data.serverStatus = healthResponse.ok ? 'running' : 'error';

      this.render();
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      this.data.serverStatus = 'error';
      this.render();
    }
  }

  render() {
    const runningProcesses = this.data.processes.filter(p => p.status === 'running').length;
    const totalSites = this.data.sites.length;

    this.innerHTML = `
      <div class="dashboard">
        <h1 class="mb-4" style="font-size: 1.875rem; font-weight: 700;">Dashboard</h1>
        
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
          <div class="card">
            <div class="card-content">
              <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">Server Status</h3>
              <div class="flex items-center gap-2">
                <span class="status ${this.data.serverStatus === 'running' ? 'status-running' : 'status-stopped'}">
                  ${this.data.serverStatus === 'running' ? '🟢 Running' : '🔴 Error'}
                </span>
              </div>
            </div>
          </div>
          
          <div class="card">
            <div class="card-content">
              <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">Sites</h3>
              <div style="font-size: 2rem; font-weight: 700; color: #2563eb;">${totalSites}</div>
              <p class="text-muted text-sm">Total sites configured</p>
            </div>
          </div>
          
          <div class="card">
            <div class="card-content">
              <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">Active Processes</h3>
              <div style="font-size: 2rem; font-weight: 700; color: #059669;">${runningProcesses}</div>
              <p class="text-muted text-sm">Currently running</p>
            </div>
          </div>
        </div>
        
        <div class="grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
          <div class="card">
            <div class="card-header">
              <h2>Recent Sites</h2>
            </div>
            <div class="card-content">
              ${this.renderRecentSites()}
            </div>
          </div>
          
          <div class="card">
            <div class="card-header">
              <h2>Running Processes</h2>
            </div>
            <div class="card-content">
              ${this.renderRunningProcesses()}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderRecentSites() {
    if (this.data.sites.length === 0) {
      return '<p class="text-muted">No sites configured</p>';
    }

    const recentSites = this.data.sites.slice(0, 5);
    return `
      <ul style="list-style: none;">
        ${recentSites.map(site => `
          <li style="padding: 0.5rem 0; border-bottom: 1px solid #e5e7eb;">
            <div class="flex justify-between items-center">
              <div>
                <strong>${site.subdomain || site.name}</strong>
                <div class="text-sm text-muted">${site.type}</div>
              </div>
              <span class="status ${site.status === 'running' ? 'status-running' : 'status-stopped'}">
                ${site.status || 'inactive'}
              </span>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  }

  renderRunningProcesses() {
    const runningProcesses = this.data.processes.filter(p => p.status === 'running');
    
    if (runningProcesses.length === 0) {
      return '<p class="text-muted">No processes running</p>';
    }

    return `
      <ul style="list-style: none;">
        ${runningProcesses.slice(0, 5).map(process => `
          <li style="padding: 0.5rem 0; border-bottom: 1px solid #e5e7eb;">
            <div class="flex justify-between items-center">
              <div>
                <strong>${process.site}</strong>
                <div class="text-sm text-muted">Port ${process.port}</div>
              </div>
              <span class="status status-running">Running</span>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  }
}

customElements.define('deploy-dashboard', DeployDashboard);