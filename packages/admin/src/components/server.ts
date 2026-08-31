// ABOUTME: Top-level live server resource dashboard.
// ABOUTME: Polls host CPU, memory, storage, load, and uptime every five seconds.

export {};

interface ResourceUsage {
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  usage_pct: number;
}

interface ServerStatus {
  status: 'running';
  recorded_at: string;
  host: {
    hostname: string;
    platform: string;
    release: string;
    uptime_seconds: number;
    cpu: {
      usage_pct: number;
      cores: number;
      load_average: number[];
    };
    memory: ResourceUsage;
    disk: ResourceUsage | null;
  };
}

interface RecentDeployment {
  id: string;
  site_id: string;
  site_name: string;
  status: 'pending' | 'cloning' | 'building' | 'starting' | 'healthy' | 'switching' | 'completed' | 'failed' | 'rolled_back';
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

const POLL_INTERVAL_MS = 5_000;

class DeployServer extends HTMLElement {
  private stats: ServerStatus | null = null;
  private loading = true;
  private error: string | null = null;
  private deployments: RecentDeployment[] = [];
  private pollInterval: number | null = null;

  connectedCallback() {
    this.render();
    void this.loadStats();
    this.pollInterval = window.setInterval(() => void this.loadStats(), POLL_INTERVAL_MS);
  }

  disconnectedCallback() {
    if (this.pollInterval !== null) {
      window.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async loadStats() {
    try {
      const [statusResponse, deploymentsResponse] = await Promise.all([
        fetch('/api/server/status', { credentials: 'include' }),
        fetch('/api/deployments?limit=8', { credentials: 'include' }),
      ]);
      if (!statusResponse.ok) {
        throw new Error(`Server returned ${statusResponse.status}`);
      }
      this.stats = await statusResponse.json();
      if (deploymentsResponse.ok) {
        this.deployments = await deploymentsResponse.json();
      }
      this.error = null;
    } catch (error) {
      console.error('Failed to load server stats:', error);
      this.error = 'Server statistics are temporarily unavailable.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unitIndex = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1
    );
    const value = bytes / 1024 ** unitIndex;
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
  }

  formatDuration(seconds: number): string {
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  renderProgress(label: string, usage: number): string {
    const filled = Math.round((Math.min(100, Math.max(0, usage)) / 100) * 16);
    return `
      <div
        class="server-stat-progress"
        role="progressbar"
        aria-label="${label}"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="${usage}"
      >
        <span class="ascii-fill">${'█'.repeat(filled)}</span><span class="ascii-track">${'░'.repeat(16 - filled)}</span>
      </div>
    `;
  }

  formatDeploymentDuration(deployment: RecentDeployment): string {
    const started = new Date(deployment.started_at).getTime();
    const ended = deployment.completed_at
      ? new Date(deployment.completed_at).getTime()
      : Date.now();
    const seconds = Math.max(0, Math.floor((ended - started) / 1_000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  renderRecentDeployments(): string {
    if (this.deployments.length === 0) {
      return '<div class="server-deployments-empty">&gt; NO DEPLOYMENTS RECORDED</div>';
    }

    return this.deployments.map((deployment) => {
      const failed = deployment.status === 'failed' || deployment.status === 'rolled_back';
      const complete = deployment.status === 'completed';
      const status = failed ? 'FAILED' : complete ? 'SUCCESS' : 'RUNNING';
      const detail = failed
        ? deployment.error_message || 'deployment failed'
        : `deploy-${deployment.site_name}:latest · blue-green · ${this.formatDeploymentDuration(deployment)}`;
      const time = new Date(deployment.started_at).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });

      return `
        <div class="server-deployment-row deployment-${status.toLowerCase()}">
          <span class="server-deployment-dot">●</span>
          <span class="server-deployment-time">${time}</span>
          <a href="/sites/${deployment.site_id}" class="server-deployment-site" data-route>${this.escapeHtml(deployment.site_name)}</a>
          <span class="server-deployment-detail">${this.escapeHtml(detail)}</span>
          <span class="server-deployment-status">${status}</span>
        </div>
      `;
    }).join('');
  }

  render() {
    if (this.loading && !this.stats) {
      this.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Server</h1>
        </div>
        <div class="empty-state"><p>Loading server statistics...</p></div>
      `;
      return;
    }

    if (!this.stats) {
      this.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Server</h1>
        </div>
        <div class="empty-state">
          <p class="empty-state-title">Statistics unavailable</p>
          <p>${this.error || 'Unable to reach the server.'}</p>
          <button class="btn" id="retry-server-stats">Retry</button>
        </div>
      `;
      this.querySelector('#retry-server-stats')?.addEventListener('click', () => {
        this.loading = true;
        this.render();
        void this.loadStats();
      });
      return;
    }

    const { host } = this.stats;
    const load = host.cpu.load_average.map(value => value.toFixed(2)).join(' / ');
    const platformName = host.platform === 'linux'
      ? 'Linux'
      : host.platform.charAt(0).toUpperCase() + host.platform.slice(1);

    this.innerHTML = `
      <div class="page-header server-page-header">
        <div class="server-title-group">
          <h1 class="page-title">SERVER</h1>
          <span class="server-online">● ONLINE</span>
        </div>
        <span class="server-updated">updated ${new Date(this.stats.recorded_at).toLocaleTimeString()}</span>
      </div>

      ${this.error ? `<div class="server-refresh-error">${this.error} Showing the latest available values.</div>` : ''}

      <div class="server-stats-grid">
        <section class="server-stat-card server-stat-cpu">
          <h2>CPU</h2>
          <div class="server-stat-value">${this.formatPercent(host.cpu.usage_pct)}</div>
          ${this.renderProgress('CPU usage', host.cpu.usage_pct)}
          <div class="server-stat-detail">${host.cpu.cores} cores · load ${load}</div>
        </section>

        <section class="server-stat-card server-stat-memory">
          <h2>Memory</h2>
          <div class="server-stat-value">${this.formatPercent(host.memory.usage_pct)}</div>
          ${this.renderProgress('Memory usage', host.memory.usage_pct)}
          <div class="server-stat-detail">${this.formatBytes(host.memory.used_bytes)} / ${this.formatBytes(host.memory.total_bytes)}</div>
        </section>

        <section class="server-stat-card server-stat-disk">
          <h2>Storage</h2>
          ${host.disk ? `
            <div class="server-stat-value">${this.formatPercent(host.disk.usage_pct)}</div>
            ${this.renderProgress('Storage usage', host.disk.usage_pct)}
            <div class="server-stat-detail">${this.formatBytes(host.disk.used_bytes)} / ${this.formatBytes(host.disk.total_bytes)}</div>
          ` : `
            <div class="server-stat-value server-stat-unavailable">Unavailable</div>
            <div class="server-stat-detail"><span>Storage path could not be read</span></div>
          `}
        </section>

        <section class="server-stat-card server-stat-uptime">
          <h2>Uptime</h2>
          <div class="server-stat-value">${this.formatDuration(host.uptime_seconds)}</div>
          <div class="server-stat-host">host ${host.hostname}</div>
          <div class="server-stat-detail">${platformName} ${host.release}</div>
        </section>
      </div>

      <section class="terminal-frame server-deployments" aria-label="Recent deployments">
        <div class="terminal-frame-title"><span>┌─ RECENT DEPLOYMENTS</span><span class="terminal-frame-line" aria-hidden="true"></span><span>─┐</span></div>
        <div class="server-deployments-list">
          ${this.renderRecentDeployments()}
        </div>
        <div class="terminal-frame-bottom"><span>└</span><span class="terminal-frame-line" aria-hidden="true"></span><span>┘</span></div>
      </section>
    `;
  }
}

customElements.define('deploy-server', DeployServer);
