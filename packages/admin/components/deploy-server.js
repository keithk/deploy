class DeployServer extends HTMLElement {
  constructor() {
    super();
    this.serverStatus = null;
    this.settings = null;
    this.savingToken = false;
  }

  connectedCallback() {
    this.render();
    this.loadServerStatus();
    this.loadSettings();

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
      console.error('failed to load server status:', error);
      this.serverStatus = { status: 'error' };
      this.render();
    }
  }

  async loadSettings() {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        this.settings = await response.json();
        this.render();
      }
    } catch (error) {
      console.error('failed to load settings:', error);
    }
  }

  async saveGitHubToken(token) {
    this.savingToken = true;
    this.render();

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_token: token })
      });

      if (response.ok) {
        const result = await response.json();
        this.settings = { ...this.settings, github_configured: result.github_configured };
        alert(token ? 'github token saved' : 'github token removed');
      } else {
        alert('failed to save github token');
      }
    } catch (error) {
      console.error('failed to save github token:', error);
      alert('failed to save github token');
    }

    this.savingToken = false;
    this.render();
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 b';
    const k = 1024;
    const sizes = ['b', 'kb', 'mb', 'gb'];
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
        <h2>server</h2>

        <!-- GitHub Integration -->
        <div class="card mb-4">
          <div class="card-header">
            <h2>github integration</h2>
          </div>
          <div class="card-content">
            ${this.renderGitHubSettings()}
          </div>
        </div>

        <!-- Server Status -->
        <div class="card mb-4">
          <div class="card-header">
            <h2>server status</h2>
          </div>
          <div class="card-content">
            ${this.renderServerStatus()}
          </div>
        </div>

        <!-- Environment Info -->
        <div class="card">
          <div class="card-header">
            <h2>environment</h2>
          </div>
          <div class="card-content">
            ${this.renderEnvironmentInfo()}
          </div>
        </div>
      </div>
    `;

    // Attach GitHub token form handler
    const tokenForm = this.querySelector('#github-token-form');
    if (tokenForm) {
      tokenForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = this.querySelector('#github-token');
        this.saveGitHubToken(input.value);
      });
    }

    const removeTokenBtn = this.querySelector('#remove-github-token');
    if (removeTokenBtn) {
      removeTokenBtn.addEventListener('click', () => {
        if (confirm('remove github token?')) {
          this.saveGitHubToken('');
        }
      });
    }
  }

  renderGitHubSettings() {
    const configured = this.settings?.github_configured;

    return `
      <div>
        <p style="margin-bottom: 1rem;">
          ${configured
            ? '<span class="status status-running">connected</span>'
            : '<span class="status status-stopped">not configured</span>'}
        </p>

        ${configured ? `
          <p style="margin-bottom: 1rem; font-size: 0.875rem; color: var(--gray);">
            github personal access token is configured. you can select repos when creating new sites.
          </p>
          <button class="btn btn-sm" id="remove-github-token" ${this.savingToken ? 'disabled' : ''}>
            remove token
          </button>
        ` : `
          <p style="margin-bottom: 1rem; font-size: 0.875rem; color: var(--gray);">
            add a github personal access token to select repos when creating sites.
            <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" style="color: var(--black);">create token →</a>
          </p>
          <form id="github-token-form" style="display: flex; gap: 0.5rem;">
            <input
              type="password"
              id="github-token"
              class="form-input"
              placeholder="ghp_xxxxxxxxxxxx"
              style="flex: 1;"
              ${this.savingToken ? 'disabled' : ''}
            />
            <button type="submit" class="btn btn-primary" ${this.savingToken ? 'disabled' : ''}>
              ${this.savingToken ? 'saving...' : 'save'}
            </button>
          </form>
        `}
      </div>
    `;
  }

  renderServerStatus() {
    if (!this.serverStatus) {
      return '<p class="text-muted">loading...</p>';
    }

    if (this.serverStatus.status === 'error') {
      return `
        <div class="flex items-center gap-4">
          <span class="status status-stopped">error</span>
          <p class="text-muted">unable to get server status</p>
        </div>
      `;
    }

    return `
      <div class="grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
        <div>
          <h4 style="font-weight: 700; margin-bottom: 0.5rem; font-size: 0.75rem;">status</h4>
          <span class="status status-running">running</span>
        </div>

        <div>
          <h4 style="font-weight: 700; margin-bottom: 0.5rem; font-size: 0.75rem;">uptime</h4>
          <p>${this.formatUptime(this.serverStatus.uptime)}</p>
        </div>

        <div>
          <h4 style="font-weight: 700; margin-bottom: 0.5rem; font-size: 0.75rem;">memory</h4>
          <p>${this.formatBytes(this.serverStatus.memory?.rss || 0)}</p>
        </div>

        <div>
          <h4 style="font-weight: 700; margin-bottom: 0.5rem; font-size: 0.75rem;">version</h4>
          <p>${this.serverStatus.version || 'unknown'}</p>
        </div>
      </div>
    `;
  }

  renderEnvironmentInfo() {
    return `
      <div style="font-size: 0.875rem;">
        <p><strong>domain:</strong> ${this.settings?.domain || window.location.hostname}</p>
        <p><strong>port:</strong> ${window.location.port || '443'}</p>
      </div>
    `;
  }
}

customElements.define('deploy-server', DeployServer);
