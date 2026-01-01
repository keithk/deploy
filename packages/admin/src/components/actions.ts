// ABOUTME: Actions component for displaying and running discovered actions
// ABOUTME: Fetches actions from the API and allows manual execution

interface Action {
  id: string;
  name: string;
  type: string;
  site_id: string | null;
  schedule: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  enabled: number;
}

class DeployActions extends HTMLElement {
  private actions: Action[] = [];
  private loading = true;
  private runningAction: string | null = null;

  connectedCallback() {
    this.render();
    this.loadActions();
  }

  async loadActions() {
    try {
      const response = await fetch('/api/actions');
      if (response.ok) {
        this.actions = await response.json();
      }
    } catch (error) {
      console.error('Failed to load actions:', error);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async runAction(actionId: string) {
    this.runningAction = actionId;
    this.render();

    try {
      const response = await fetch(`/api/actions/${actionId}/run`, {
        method: 'POST'
      });

      if (response.ok) {
        // Reload actions to get updated last_run info
        await this.loadActions();
      } else {
        const error = await response.json();
        alert(`Failed to run action: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to run action:', error);
      alert('Failed to run action');
    } finally {
      this.runningAction = null;
      this.render();
    }
  }

  formatDate(dateString: string | null): string {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  }

  getStatusClass(status: string | null): string {
    if (!status) return '';
    return status === 'success' ? 'success' : 'error';
  }

  render() {
    if (this.loading) {
      this.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Actions</h1>
        </div>
        <div class="empty-state">
          <p>Loading actions...</p>
        </div>
      `;
      return;
    }

    if (this.actions.length === 0) {
      this.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Actions</h1>
        </div>
        <div class="empty-state">
          <p class="empty-state-title">No actions found</p>
          <p>Actions are discovered from deployed sites' <code>.deploy/actions/</code> directories.</p>
        </div>
      `;
      return;
    }

    this.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Actions</h1>
      </div>

      <div class="actions-list">
        ${this.actions.map(action => `
          <div class="action-row">
            <div class="action-status ${this.getStatusClass(action.last_run_status)}"></div>
            <div class="action-info">
              <div class="action-name-row">
                <span class="action-name">${action.name}</span>
                <span class="action-type">${action.type}</span>
              </div>
              <div class="action-meta">
                ${action.schedule ? `<span>Schedule: ${action.schedule}</span>` : ''}
                <span>Last run: ${this.formatDate(action.last_run_at)}</span>
              </div>
              ${action.last_run_message ? `
                <div class="action-message ${this.getStatusClass(action.last_run_status)}">
                  ${action.last_run_message}
                </div>
              ` : ''}
            </div>
            <div class="action-actions">
              <button
                class="btn btn-sm"
                data-action-id="${action.id}"
                ${this.runningAction === action.id ? 'disabled' : ''}
              >
                ${this.runningAction === action.id ? 'Running...' : 'Run'}
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      <style>
        .actions-list {
          display: flex;
          flex-direction: column;
        }
        .action-row {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          padding: var(--space-4);
          border-bottom: 1px solid var(--border);
        }
        .action-row:last-child {
          border-bottom: none;
        }
        .action-status {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-faint);
          flex-shrink: 0;
        }
        .action-status.success {
          background: var(--status-running);
        }
        .action-status.error {
          background: var(--status-error);
        }
        .action-info {
          flex: 1;
          min-width: 0;
        }
        .action-name-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .action-name {
          font-weight: 500;
          color: var(--text);
        }
        .action-type {
          font-size: var(--text-xs);
          color: var(--text-muted);
          padding: 2px 6px;
          background: var(--surface);
          border-radius: 2px;
        }
        .action-meta {
          display: flex;
          gap: var(--space-4);
          margin-top: var(--space-1);
          font-size: var(--text-xs);
          color: var(--text-muted);
        }
        .action-actions {
          display: flex;
          gap: var(--space-2);
        }
        .action-message {
          font-size: var(--text-xs);
          color: var(--text-muted);
          margin-top: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: var(--surface);
          border-radius: 4px;
          border-left: 2px solid var(--border);
        }
        .action-message.success {
          border-left-color: var(--status-running);
        }
        .action-message.error {
          border-left-color: var(--status-error);
        }
      </style>
    `;

    // Add event listeners for run buttons
    const runButtons = this.querySelectorAll('button[data-action-id]');
    runButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const actionId = btn.getAttribute('data-action-id');
        if (actionId) {
          this.runAction(actionId);
        }
      });
    });
  }
}

customElements.define('deploy-actions', DeployActions);
