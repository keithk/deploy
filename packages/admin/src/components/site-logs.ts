// ABOUTME: Component for displaying site build and runtime logs
// ABOUTME: Fetches logs from API and displays with auto-refresh option

class SiteLogs extends HTMLElement {
  private siteId: string = '';
  private siteName: string = '';
  private logType: 'build' | 'runtime' = 'build';
  private refreshInterval: number | null = null;

  static get observedAttributes() {
    return ['site-id'];
  }

  attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
    if (name === 'site-id' && newValue) {
      this.siteId = newValue;
      this.loadSiteAndLogs();
    }
  }

  connectedCallback() {
    if (this.siteId) {
      this.loadSiteAndLogs();
    }
  }

  disconnectedCallback() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async loadSiteAndLogs() {
    // First get site info for the name
    try {
      const siteRes = await fetch(`/api/sites/${this.siteId}`, {
        credentials: 'include'
      });
      if (siteRes.ok) {
        const site = await siteRes.json();
        this.siteName = site.name;
      }
    } catch {
      this.siteName = 'Unknown';
    }

    this.render();
    this.loadLogs();
  }

  async loadLogs() {
    const logsContainer = this.querySelector('.logs-content');
    if (!logsContainer) return;

    logsContainer.innerHTML = '<div class="loading">LOADING...</div>';

    try {
      const res = await fetch(`/api/sites/${this.siteId}/logs?type=${this.logType}&limit=100`, {
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error('Failed to fetch logs');
      }

      const logs = await res.json();

      if (logs.length === 0) {
        logsContainer.innerHTML = '<div class="empty">No logs available</div>';
        return;
      }

      // Combine all log content
      const logContent = logs
        .map((log: { content: string; timestamp: string }) => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          return `[${time}] ${log.content}`;
        })
        .join('\n');

      logsContainer.innerHTML = `<pre>${this.escapeHtml(logContent)}</pre>`;

      // Auto-scroll to bottom
      logsContainer.scrollTop = logsContainer.scrollHeight;
    } catch (err) {
      logsContainer.innerHTML = `<div class="error">Failed to load logs: ${err}</div>`;
    }
  }

  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  setLogType(type: 'build' | 'runtime') {
    this.logType = type;
    this.updateTabStyles();
    this.loadLogs();
  }

  updateTabStyles() {
    const tabs = this.querySelectorAll('.log-tab');
    tabs.forEach((tab) => {
      const tabType = tab.getAttribute('data-type');
      if (tabType === this.logType) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
  }

  toggleAutoRefresh() {
    const btn = this.querySelector('.auto-refresh-btn') as HTMLButtonElement;
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      if (btn) btn.textContent = 'AUTO-REFRESH: OFF';
    } else {
      this.refreshInterval = window.setInterval(() => this.loadLogs(), 3000);
      if (btn) btn.textContent = 'AUTO-REFRESH: ON';
    }
  }

  render() {
    this.innerHTML = `
      <div class="container">
        <header class="logs-header">
          <div>
            <a href="/" data-route class="back-link">&larr; BACK</a>
            <h1>LOGS: ${this.siteName.toUpperCase()}</h1>
          </div>
          <div class="logs-controls">
            <button class="auto-refresh-btn" type="button">AUTO-REFRESH: OFF</button>
            <button class="refresh-btn" type="button">REFRESH</button>
          </div>
        </header>

        <div class="log-tabs">
          <button class="log-tab active" data-type="build" type="button">BUILD</button>
          <button class="log-tab" data-type="runtime" type="button">RUNTIME</button>
        </div>

        <div class="logs-content"></div>
      </div>

      <style>
        .logs-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--size-4);
          padding: var(--size-4) 0;
          border-bottom: 1px solid var(--surface-3);
        }

        .logs-header h1 {
          font-size: var(--font-size-4);
          font-weight: 400;
          letter-spacing: 0.05em;
          margin: var(--size-2) 0 0 0;
        }

        .back-link {
          font-size: var(--font-size-1);
          color: var(--text-2);
          text-decoration: none;
          letter-spacing: 0.05em;
        }

        .back-link:hover {
          color: var(--text-1);
        }

        .logs-controls {
          display: flex;
          gap: var(--size-2);
        }

        .logs-controls button {
          font-family: var(--font-mono);
          font-size: var(--font-size-0);
          padding: var(--size-2) var(--size-3);
          background: transparent;
          border: 1px solid var(--surface-3);
          color: var(--text-2);
          cursor: pointer;
          letter-spacing: 0.05em;
        }

        .logs-controls button:hover {
          border-color: var(--text-1);
          color: var(--text-1);
        }

        .log-tabs {
          display: flex;
          gap: 0;
          margin-bottom: var(--size-3);
          border-bottom: 1px solid var(--surface-3);
        }

        .log-tab {
          font-family: var(--font-mono);
          font-size: var(--font-size-0);
          padding: var(--size-2) var(--size-4);
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-2);
          cursor: pointer;
          letter-spacing: 0.1em;
          margin-bottom: -1px;
        }

        .log-tab:hover {
          color: var(--text-1);
        }

        .log-tab.active {
          color: var(--text-1);
          border-bottom-color: var(--text-1);
        }

        .logs-content {
          background: var(--surface-1);
          border: 1px solid var(--surface-3);
          min-height: 400px;
          max-height: 70vh;
          overflow: auto;
          padding: var(--size-3);
        }

        .logs-content pre {
          font-family: var(--font-mono);
          font-size: var(--font-size-0);
          line-height: 1.6;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-all;
          color: var(--text-2);
        }

        .logs-content .loading,
        .logs-content .empty,
        .logs-content .error {
          color: var(--text-2);
          font-size: var(--font-size-1);
          letter-spacing: 0.05em;
        }

        .logs-content .error {
          color: var(--status-error);
        }
      </style>
    `;

    // Add event listeners
    this.querySelector('.refresh-btn')?.addEventListener('click', () => this.loadLogs());
    this.querySelector('.auto-refresh-btn')?.addEventListener('click', () => this.toggleAutoRefresh());

    this.querySelectorAll('.log-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const type = (e.target as HTMLElement).getAttribute('data-type') as 'build' | 'runtime';
        this.setLogType(type);
      });
    });
  }
}

customElements.define('site-logs', SiteLogs);
