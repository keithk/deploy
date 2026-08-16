// ABOUTME: Deployments list component showing active and historical deployments
// ABOUTME: Displays deployment status, site name, timing, and error messages

import { showConfirm } from './confirm-dialog.js';
import { showToast } from './toast.js';

interface Deployment {
  id: string;
  site_id: string;
  site_name: string;
  status: 'pending' | 'cloning' | 'building' | 'starting' | 'healthy' | 'switching' | 'completed' | 'failed' | 'rolled_back';
  started_at: string;
  completed_at: string | null;
  old_container_id: string | null;
  old_port: number | null;
  new_container_id: string | null;
  new_port: number | null;
  commit_sha: string | null;
  commit_message: string | null;
  error_message: string | null;
}

class DeployDeployments extends HTMLElement {
  private deployments: Deployment[] = [];
  private activeDeployments: Deployment[] = [];
  private loading: boolean = true;
  private refreshInterval: number | null = null;
  private cancellingDeploymentIds = new Set<string>();

  connectedCallback() {
    this.addEventListener('click', this.handleClick);
    this.render();
    this.loadDeployments();
    // Refresh every 3 seconds to show active deployment progress
    this.refreshInterval = window.setInterval(() => this.loadDeployments(), 3000);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.handleClick);
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  private handleClick = (event: Event) => {
    const target = event.target as Element;
    const button = target.closest<HTMLButtonElement>('[data-cancel-deployment]');
    if (!button) return;

    const deployment = this.activeDeployments.find(
      (item) => item.id === button.dataset.cancelDeployment
    );
    if (deployment) {
      void this.handleCancelDeployment(deployment);
    }
  };

  private async handleCancelDeployment(deployment: Deployment) {
    if (this.cancellingDeploymentIds.has(deployment.id)) return;

    const confirmed = await showConfirm(
      'Cancel Deployment',
      `Cancel the in-progress deployment for ${deployment.site_name}?`,
      { confirmText: 'Cancel Deployment', destructive: true }
    );
    if (!confirmed) return;
    if (this.cancellingDeploymentIds.has(deployment.id)) return;

    this.cancellingDeploymentIds.add(deployment.id);
    this.render();

    try {
      const response = await fetch(`/api/deployments/${deployment.id}/cancel`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to cancel deployment');
      }

      showToast(`Cancelled deployment for ${deployment.site_name}`, 'success');
      await this.loadDeployments();
    } catch (error) {
      console.error('Failed to cancel deployment:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to cancel deployment',
        'error'
      );
    } finally {
      this.cancellingDeploymentIds.delete(deployment.id);
      this.render();
    }
  }

  async loadDeployments() {
    try {
      const [deploymentsRes, activeRes] = await Promise.all([
        fetch('/api/deployments?limit=50'),
        fetch('/api/deployments/active')
      ]);

      if (deploymentsRes.ok) {
        this.deployments = await deploymentsRes.json();
      }
      if (activeRes.ok) {
        this.activeDeployments = await activeRes.json();
      }
    } catch (error) {
      console.error('Failed to load deployments:', error);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  getStatusBadgeClass(status: Deployment['status']): string {
    switch (status) {
      case 'completed':
        return 'badge-success';
      case 'failed':
      case 'rolled_back':
        return 'badge-error';
      case 'pending':
      case 'cloning':
      case 'building':
      case 'starting':
      case 'healthy':
      case 'switching':
        return 'badge-warning';
      default:
        return '';
    }
  }

  getStatusLabel(status: Deployment['status']): string {
    switch (status) {
      case 'pending': return 'Pending';
      case 'cloning': return 'Cloning';
      case 'building': return 'Building';
      case 'starting': return 'Starting';
      case 'healthy': return 'Health Check';
      case 'switching': return 'Switching';
      case 'completed': return 'Completed';
      case 'failed': return 'Failed';
      case 'rolled_back': return 'Rolled Back';
      default: return status;
    }
  }

  formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString();
  }

  formatDuration(startedAt: string, completedAt: string | null): string {
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const duration = Math.floor((end - start) / 1000);

    if (duration < 60) {
      return `${duration}s`;
    } else if (duration < 3600) {
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(duration / 3600);
      const mins = Math.floor((duration % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  }

  render() {
    this.innerHTML = `
      <div class="page-header">
        <div class="flex items-center gap-3">
          <h1 class="page-title">Deployments</h1>
        </div>
      </div>

      ${this.activeDeployments.length > 0 ? this.renderActiveSection() : ''}

      <div class="deployments-section">
        <h2 class="section-title">Recent Deployments</h2>
        ${this.renderDeploymentsList()}
      </div>
    `;
  }

  renderActiveSection(): string {
    return `
      <div class="deployments-section deployments-active">
        <h2 class="section-title">In Progress</h2>
        <div class="deployments-list">
          ${this.activeDeployments.map(d => this.renderDeploymentRow(d, true)).join('')}
        </div>
      </div>
    `;
  }

  renderDeploymentsList(): string {
    if (this.loading) {
      return `
        <div class="empty-state">
          <p>Loading deployments...</p>
        </div>
      `;
    }

    if (this.deployments.length === 0) {
      return `
        <div class="empty-state">
          <p class="empty-state-title">No deployments yet</p>
          <p>Deploy a site to see deployment history.</p>
        </div>
      `;
    }

    return `
      <div class="deployments-list">
        ${this.deployments.map(d => this.renderDeploymentRow(d, false)).join('')}
      </div>
    `;
  }

  renderDeploymentRow(deployment: Deployment, isActive: boolean): string {
    const badgeClass = this.getStatusBadgeClass(deployment.status);
    const statusLabel = this.getStatusLabel(deployment.status);
    const duration = this.formatDuration(deployment.started_at, deployment.completed_at);
    const startTime = this.formatTime(deployment.started_at);
    const isCancelling = this.cancellingDeploymentIds.has(deployment.id);

    return `
      <div class="deployment-row ${isActive ? 'deployment-active' : ''}">
        <div class="deployment-info">
          <div class="deployment-header">
            <a href="/sites/${deployment.site_id}" class="deployment-site-name" data-route>${deployment.site_name}</a>
            <span class="badge ${badgeClass}">${statusLabel}</span>
            ${isActive ? '<span class="deployment-spinner"></span>' : ''}
          </div>
          <div class="deployment-meta">
            <span class="deployment-time">${startTime}</span>
            <span class="deployment-duration">${duration}</span>
            ${deployment.commit_sha ? `<span class="deployment-commit" title="${deployment.commit_message || ''}">${deployment.commit_sha.substring(0, 7)}</span>` : ''}
          </div>
          ${deployment.error_message ? `<div class="deployment-error">${deployment.error_message}</div>` : ''}
        </div>
        ${isActive ? `
          <div class="deployment-actions">
            <button
              type="button"
              class="btn btn-sm btn-danger"
              data-cancel-deployment="${deployment.id}"
              ${isCancelling ? 'disabled' : ''}
            >${isCancelling ? 'Cancelling...' : 'Cancel'}</button>
          </div>
        ` : ''}
      </div>
    `;
  }
}

customElements.define('deploy-deployments', DeployDeployments);
