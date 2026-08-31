// ABOUTME: One row in the CRT sites table.
// ABOUTME: Displays state, current resource usage, deployment recency, and quick actions.

import { showToast } from './toast.js';

class DeploySiteCard extends HTMLElement {
  static get observedAttributes() {
    return [
      'site-id',
      'name',
      'status',
      'subdomain',
      'domain',
      'cpu-pct',
      'mem-pct',
      'last-deployed-at',
    ];
  }

  get siteId(): string {
    return this.getAttribute('site-id') || '';
  }

  get siteName(): string {
    return this.getAttribute('name') || '';
  }

  get status(): string {
    return this.getAttribute('status') || 'stopped';
  }

  get cpuPercent(): number | null {
    return this.readPercent('cpu-pct');
  }

  get memoryPercent(): number | null {
    return this.readPercent('mem-pct');
  }

  connectedCallback() {
    this.render();
  }

  readPercent(attribute: string): number | null {
    const value = this.getAttribute(attribute);
    if (value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : null;
  }

  statusLabel(): string {
    switch (this.status) {
      case 'running': return 'LIVE';
      case 'building': return 'BUILDING';
      case 'sleeping': return 'ASLEEP';
      case 'error': return 'FAILED';
      default: return 'STOPPED';
    }
  }

  renderMeter(value: number | null): string {
    if (value === null) {
      return '<span class="ascii-meter"><span class="ascii-track">░░░░░░░░</span> <span class="metric-value">--</span></span>';
    }

    const filled = Math.round((value / 100) * 8);
    return `
      <span class="ascii-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}">
        <span class="ascii-fill">${'█'.repeat(filled)}</span><span class="ascii-track">${'░'.repeat(8 - filled)}</span>
        <span class="metric-value">${value.toFixed(1)}%</span>
      </span>
    `;
  }

  formatLastDeployment(): string {
    const value = this.getAttribute('last-deployed-at');
    if (!value) return 'NEVER';
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1_000));
    if (elapsedSeconds < 60) return `${elapsedSeconds}s AGO`;
    if (elapsedSeconds < 3_600) return `${Math.floor(elapsedSeconds / 60)}m AGO`;
    if (elapsedSeconds < 86_400) return `${Math.floor(elapsedSeconds / 3_600)}h AGO`;
    return `${Math.floor(elapsedSeconds / 86_400)}d AGO`;
  }

  async handleRedeploy() {
    try {
      const response = await fetch(`/api/sites/${this.siteId}/deploy`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        showToast(`Deployment started for ${this.siteName}`, 'success');
        window.dispatchEvent(new CustomEvent('site-updated'));
      } else {
        const error = await response.json();
        showToast(`Failed to redeploy: ${error.message || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      console.error('Redeploy failed:', error);
      showToast('Failed to redeploy site', 'error');
    }
  }

  render() {
    const isSleeping = this.status === 'sleeping';

    this.innerHTML = `
      <div class="site-row status-${this.status}${isSleeping ? ' site-row-sleeping' : ''}">
        <span class="site-status-dot" aria-hidden="true">●</span>
        <a href="/sites/${this.siteId}" class="site-name" data-route>${this.siteName}</a>
        <span class="site-state">${this.statusLabel()}</span>
        ${this.renderMeter(this.cpuPercent)}
        ${this.renderMeter(this.memoryPercent)}
        <span class="site-last-deploy">${this.formatLastDeployment()}</span>
        <span class="site-actions">
          <a href="/sites/${this.siteId}?tab=build" class="site-command" data-route>[LOG]</a>
          <button class="site-command" id="redeploy-btn">[RUN]</button>
        </span>
      </div>
    `;

    this.querySelector('#redeploy-btn')?.addEventListener('click', () => void this.handleRedeploy());
  }
}

customElements.define('deploy-site-card', DeploySiteCard);
