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

const POLL_INTERVAL_MS = 5_000;

class DeployServer extends HTMLElement {
  private stats: ServerStatus | null = null;
  private loading = true;
  private error: string | null = null;
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
      const response = await fetch('/api/server/status', { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      this.stats = await response.json();
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

  progressWidth(value: number): number {
    return Math.min(100, Math.max(0, value));
  }

  renderProgress(label: string, usage: number): string {
    return `
      <div
        class="server-stat-progress"
        role="progressbar"
        aria-label="${label}"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="${usage}"
      >
        <span style="width: ${this.progressWidth(usage)}%"></span>
      </div>
    `;
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
          <h1 class="page-title">Server</h1>
          <span class="server-online"><span></span>Online</span>
        </div>
        <span class="server-updated">Updated ${new Date(this.stats.recorded_at).toLocaleTimeString()}</span>
      </div>

      ${this.error ? `<div class="server-refresh-error">${this.error} Showing the latest available values.</div>` : ''}

      <div class="server-stats-grid">
        <section class="server-stat-card server-stat-cpu">
          <h2>CPU</h2>
          <div class="server-stat-value">${this.formatPercent(host.cpu.usage_pct)}</div>
          ${this.renderProgress('CPU usage', host.cpu.usage_pct)}
          <div class="server-stat-detail server-stat-detail-stacked">
            <span>${host.cpu.cores} logical cores</span>
            <span>Load ${load}</span>
          </div>
        </section>

        <section class="server-stat-card server-stat-memory">
          <h2>Memory</h2>
          <div class="server-stat-value">${this.formatPercent(host.memory.usage_pct)}</div>
          ${this.renderProgress('Memory usage', host.memory.usage_pct)}
          <div class="server-stat-detail">
            <span>${this.formatBytes(host.memory.used_bytes)} used</span>
            <span>${this.formatBytes(host.memory.total_bytes)} total</span>
          </div>
        </section>

        <section class="server-stat-card server-stat-disk">
          <h2>Storage</h2>
          ${host.disk ? `
            <div class="server-stat-value">${this.formatPercent(host.disk.usage_pct)}</div>
            ${this.renderProgress('Storage usage', host.disk.usage_pct)}
            <div class="server-stat-detail">
              <span>${this.formatBytes(host.disk.used_bytes)} used</span>
              <span>${this.formatBytes(host.disk.total_bytes)} total</span>
            </div>
          ` : `
            <div class="server-stat-value server-stat-unavailable">Unavailable</div>
            <div class="server-stat-detail"><span>Storage path could not be read</span></div>
          `}
        </section>

        <section class="server-stat-card server-stat-uptime">
          <h2>Uptime</h2>
          <div class="server-stat-value">${this.formatDuration(host.uptime_seconds)}</div>
          <div class="server-stat-detail">
            <span>Host system uptime</span>
          </div>
        </section>
      </div>

      <section class="server-details">
        <h2 class="section-title">System</h2>
        <dl>
          <div><dt>Hostname</dt><dd>${host.hostname}</dd></div>
          <div><dt>Operating system</dt><dd>${platformName} ${host.release}</dd></div>
          <div><dt>CPU cores</dt><dd>${host.cpu.cores}</dd></div>
          <div><dt>Load average</dt><dd>${load}</dd></div>
        </dl>
      </section>
    `;
  }
}

customElements.define('deploy-server', DeployServer);
