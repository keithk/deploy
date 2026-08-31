// ABOUTME: Persistent CRT status ticker shown beneath list-style views.
// ABOUTME: Derives live-site and daily-deployment summaries from existing APIs.

interface TickerSite {
  name: string;
  status: string;
}

interface TickerDeployment {
  site_name: string;
  status: string;
  started_at: string;
}

interface TickerServerStatus {
  host: {
    cpu: { load_average: number[] };
    memory: { usage_pct: number };
  };
}

const REFRESH_INTERVAL_MS = 15_000;

class DeployStatusTicker extends HTMLElement {
  private sites: TickerSite[] = [];
  private deployments: TickerDeployment[] = [];
  private server: TickerServerStatus | null = null;
  private refreshInterval: number | null = null;
  private clockInterval: number | null = null;

  connectedCallback() {
    this.render();
    this.updateClock();
    void this.loadStatus();
    this.refreshInterval = window.setInterval(() => void this.loadStatus(), REFRESH_INTERVAL_MS);
    this.clockInterval = window.setInterval(() => this.updateClock(), 1_000);
  }

  disconnectedCallback() {
    if (this.refreshInterval !== null) window.clearInterval(this.refreshInterval);
    if (this.clockInterval !== null) window.clearInterval(this.clockInterval);
  }

  async loadStatus() {
    try {
      const [sitesResponse, deploymentsResponse, serverResponse] = await Promise.all([
        fetch('/api/sites', { credentials: 'include' }),
        fetch('/api/deployments?limit=100', { credentials: 'include' }),
        fetch('/api/server/status', { credentials: 'include' }),
      ]);

      if (sitesResponse.ok) this.sites = await sitesResponse.json();
      if (deploymentsResponse.ok) this.deployments = await deploymentsResponse.json();
      if (serverResponse.ok) this.server = await serverResponse.json();
      this.render();
      this.updateClock();
    } catch (error) {
      console.error('Failed to load platform status:', error);
    }
  }

  isToday(isoDate: string): boolean {
    const date = new Date(isoDate);
    const today = new Date();
    return date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth()
      && date.getDate() === today.getDate();
  }

  relativeTime(isoDate: string): string {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1_000));
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
    return `${Math.floor(seconds / 86_400)}d`;
  }

  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  updateClock() {
    const clock = this.querySelector<HTMLElement>('#ticker-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour12: false });
  }

  render() {
    const todaysDeployments = this.deployments.filter((deployment) => this.isToday(deployment.started_at));
    const failures = todaysDeployments.filter((deployment) =>
      deployment.status === 'failed' || deployment.status === 'rolled_back'
    );
    const lastDeployment = this.deployments[0];
    const liveSites = this.sites.filter((site) => site.status === 'running').length;
    const load = this.server?.host.cpu.load_average[0]?.toFixed(2) ?? '--';
    const memory = this.server ? `${this.server.host.memory.usage_pct.toFixed(1)}%` : '--';

    this.innerHTML = `
      <footer class="status-ticker" aria-label="Platform status">
        <span><strong>▲${todaysDeployments.length}</strong> DEPLOYS TODAY</span>
        <span>${liveSites}/${this.sites.length} LIVE</span>
        ${lastDeployment ? `<span class="ticker-last">LAST: <strong class="ticker-bright">${this.escapeHtml(lastDeployment.site_name)}</strong> ${this.relativeTime(lastDeployment.started_at)}</span>` : ''}
        <span>LOAD ${load}</span>
        <span>MEM ${memory}</span>
        ${failures.length > 0 ? `<span class="ticker-failure">${failures.length} FAILURE${failures.length === 1 ? '' : 'S'}: ${this.escapeHtml(failures[0].site_name)}</span>` : '<span class="ticker-ok">NO FAILURES</span>'}
        <span class="ticker-clock"><span id="ticker-clock"></span><i class="terminal-cursor" aria-hidden="true"></i></span>
      </footer>
    `;
  }
}

customElements.define('deploy-status-ticker', DeployStatusTicker);
