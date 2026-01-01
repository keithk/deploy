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
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  getStatusBadge(status: string | null): string {
    if (!status) return '';
    const color = status === 'success' ? 'var(--green-6)' : 'var(--red-6)';
    return `<span class="status-badge" style="background: ${color};">${status}</span>`;
  }

  getTypeBadge(type: string): string {
    const colors: Record<string, string> = {
      scheduled: 'var(--blue-6)',
      webhook: 'var(--purple-6)',
      hook: 'var(--orange-6)',
      custom: 'var(--gray-6)'
    };
    const color = colors[type] || 'var(--gray-6)';
    return `<span class="type-badge" style="background: ${color};">${type}</span>`;
  }

  render() {
    if (this.loading) {
      this.innerHTML = `
        <div class="actions-section">
          <h2 class="actions-heading">
            ACTIONS
          </h2>
          <div class="card empty-state">
            <p class="text-muted">loading actions...</p>
          </div>
        </div>
      `;
      return;
    }

    if (this.actions.length === 0) {
      this.innerHTML = `
        <div class="actions-section">
          <h2 class="actions-heading">
            ACTIONS
          </h2>
          <div class="card empty-state">
            <p class="text-muted">
              no actions found. actions are discovered from deployed sites' <code>.deploy/actions/</code> directories.
            </p>
          </div>
        </div>
      `;
      return;
    }

    this.innerHTML = `
      <div class="actions-section">
        <h2 class="actions-heading">
          ACTIONS
        </h2>

        <div class="actions-list">
          ${this.actions.map(action => `
            <div class="card action-card">
              <div class="action-header">
                <div class="action-info">
                  <span class="action-name">${action.name}</span>
                  ${this.getTypeBadge(action.type)}
                  ${this.getStatusBadge(action.last_run_status)}
                </div>
                <button
                  class="btn btn-sm"
                  data-action-id="${action.id}"
                  ${this.runningAction === action.id ? 'disabled' : ''}
                >
                  ${this.runningAction === action.id ? 'RUNNING...' : 'RUN'}
                </button>
              </div>
              <div class="action-meta">
                ${action.schedule ? `<span>schedule: ${action.schedule}</span>` : ''}
                <span>last run: ${this.formatDate(action.last_run_at)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <style>
        .empty-state {
          text-align: center;
          padding: var(--size-5);
        }
        .actions-heading {
          font-size: var(--font-size-4);
          font-weight: 400;
          color: var(--text-1);
          margin-bottom: var(--size-4);
          letter-spacing: 0.1em;
        }
        .actions-list {
          display: flex;
          flex-direction: column;
          gap: var(--size-3);
        }
        .action-card {
          padding: var(--size-4);
        }
        .action-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .action-info {
          display: flex;
          align-items: center;
          gap: var(--size-2);
        }
        .action-name {
          font-weight: 400;
          color: var(--text-1);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .action-meta {
          display: flex;
          gap: var(--size-4);
          margin-top: var(--size-2);
          font-size: var(--font-size-0);
          color: var(--text-2);
        }
        .type-badge, .status-badge {
          padding: var(--size-1) var(--size-2);
          border-radius: 0;
          font-size: var(--font-size-00);
          color: var(--surface-1);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.05em;
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
