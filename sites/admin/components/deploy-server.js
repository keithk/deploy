class DeployServer extends HTMLElement {
  constructor() {
    super();
    this.serverStatus = null;
  }

  connectedCallback() {
    this.render();
    this.loadServerStatus();
    
    // Auto-refresh every 10 seconds
    this.intervalId = setInterval(() => {
      this.loadServerStatus();
    }, 10000);
  }

  disconnectedCallback() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async loadServerStatus() {
    try {
      const response = await fetch('/api/server/status');
      if (response.ok) {
        this.serverStatus = await response.json();
        this.render();
      }
    } catch (error) {
      console.error('Failed to load server status:', error);
      this.serverStatus = { status: 'error' };
      this.render();
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  render() {
    this.innerHTML = `
      <div class="server-manager">
        <h1 class="mb-4" style="font-size: 1.875rem; font-weight: 700;">Server Management</h1>
        
        <!-- Server Status -->
        <div class="card mb-4">
          <div class="card-header">
            <h2>Server Status</h2>
          </div>
          <div class="card-content">
            ${this.renderServerStatus()}
          </div>
        </div>
        
        <!-- Server Actions -->
        <div class="card mb-4">
          <div class="card-header">
            <h2>Server Actions</h2>
          </div>
          <div class="card-content">
            ${this.renderServerActions()}
          </div>
        </div>
        
        <!-- Environment Info -->
        <div class="card">
          <div class="card-header">
            <h2>Environment Information</h2>
          </div>
          <div class="card-content">
            ${this.renderEnvironmentInfo()}
          </div>
        </div>
      </div>
    `;
  }

  renderServerStatus() {
    if (!this.serverStatus) {
      return '<p class="text-muted">Loading server status...</p>';
    }

    if (this.serverStatus.status === 'error') {
      return `
        <div class="flex items-center gap-4">
          <span class="status status-stopped">🔴 Server Error</span>
          <p class="text-muted">Unable to retrieve server status</p>
        </div>
      `;
    }

    return `
      <div class="grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
        <div>
          <h4 style="font-weight: 600; margin-bottom: 0.5rem;">Status</h4>
          <span class="status status-running">🟢 Running</span>
        </div>
        
        <div>
          <h4 style="font-weight: 600; margin-bottom: 0.5rem;">Uptime</h4>
          <p>${this.formatUptime(this.serverStatus.uptime)}</p>
        </div>
        
        <div>
          <h4 style="font-weight: 600; margin-bottom: 0.5rem;">Memory Usage</h4>
          <p>${this.formatBytes(this.serverStatus.memory?.rss || 0)} RSS</p>
          <p class="text-sm text-muted">${this.formatBytes(this.serverStatus.memory?.heapUsed || 0)} / ${this.formatBytes(this.serverStatus.memory?.heapTotal || 0)} Heap</p>
        </div>
        
        <div>
          <h4 style="font-weight: 600; margin-bottom: 0.5rem;">Node Version</h4>
          <p>${this.serverStatus.version || 'Unknown'}</p>
        </div>
      </div>
    `;
  }

  renderServerActions() {
    return `
      <div class="grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
        <div>
          <h4 style="font-weight: 600; margin-bottom: 0.5rem;">Server Control</h4>
          <div class="flex gap-2 mb-2">
            <button class="btn btn-sm btn-danger" onclick="alert('Server restart functionality coming soon!')">
              Restart Server
            </button>
          </div>
          <p class="text-sm text-muted">Restart the main server process</p>
        </div>
        
        <div>
          <h4 style="font-weight: 600; margin-bottom: 0.5rem;">Process Management</h4>
          <div class="flex gap-2 mb-2">
            <button class="btn btn-sm btn-secondary" onclick="window.deployApp.showSection('processes')">
              Manage Processes
            </button>
          </div>
          <p class="text-sm text-muted">View and control site processes</p>
        </div>
        
        <div>
          <h4 style="font-weight: 600; margin-bottom: 0.5rem;">Configuration</h4>
          <div class="flex gap-2 mb-2">
            <button class="btn btn-sm btn-secondary" onclick="alert('Configuration UI coming soon!')">
              Edit Config
            </button>
          </div>
          <p class="text-sm text-muted">Modify server configuration</p>
        </div>
      </div>
    `;
  }

  renderEnvironmentInfo() {
    return `
      <div class="grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
        <div>
          <h4 style="font-weight: 600; margin-bottom: 0.5rem;">Environment Variables</h4>
          <ul style="list-style: none; font-size: 0.875rem;">
            <li style="margin-bottom: 0.25rem;"><code>PORT</code>: ${window.location.port || '3000'}</li>
            <li style="margin-bottom: 0.25rem;"><code>PROJECT_DOMAIN</code>: ${window.location.hostname}</li>
            <li style="margin-bottom: 0.25rem;"><code>MODE</code>: Production</li>
          </ul>
        </div>
        
        <div>
          <h4 style="font-weight: 600; margin-bottom: 0.5rem;">Runtime Info</h4>
          <ul style="list-style: none; font-size: 0.875rem;">
            <li style="margin-bottom: 0.25rem;"><strong>Platform:</strong> ${navigator.platform}</li>
            <li style="margin-bottom: 0.25rem;"><strong>User Agent:</strong> ${navigator.userAgent.split(' ').slice(0, 3).join(' ')}</li>
          </ul>
        </div>
      </div>
    `;
  }
}

customElements.define('deploy-server', DeployServer);