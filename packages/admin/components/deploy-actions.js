class DeployActions extends HTMLElement {
  constructor() {
    super();
    this.actions = [];
  }

  connectedCallback() {
    this.render();
    this.loadActions();
  }

  async loadActions() {
    try {
      // For now, we'll show a placeholder since actions API might need more integration
      this.actions = [
        {
          id: 1,
          name: 'GitHub Webhook',
          type: 'webhook',
          site: 'my-site',
          status: 'active',
          lastRun: new Date().toISOString()
        }
      ];
      this.render();
    } catch (error) {
      console.error('Failed to load actions:', error);
    }
  }

  render() {
    this.innerHTML = `
      <div class="actions-manager">
        <div class="flex justify-between items-center mb-4">
          <h1 style="font-size: 1.875rem; font-weight: 700;">Actions</h1>
          <button class="btn btn-primary" onclick="alert('Action creation coming soon!')">
            Create Action
          </button>
        </div>
        
        <!-- Actions Info -->
        <div class="card mb-4">
          <div class="card-content">
            <h3 class="mb-2">About Actions</h3>
            <p class="text-muted">
              Actions are automated workflows that can be triggered by webhooks, schedules, or manual execution.
              They can build sites, deploy updates, run tests, and more.
            </p>
            <p class="text-muted">
              Actions are configured in <code>.dialup/actions/</code> directories at the root or site level.
            </p>
          </div>
        </div>
        
        <!-- Actions Table -->
        <div class="card">
          <div class="card-header">
            <h2>Configured Actions</h2>
          </div>
          <div class="card-content">
            ${this.renderActionsTable()}
          </div>
        </div>
      </div>
    `;
  }

  renderActionsTable() {
    if (this.actions.length === 0) {
      return `
        <div class="text-center" style="padding: 2rem;">
          <p class="text-muted mb-4">No actions configured yet.</p>
          <p class="text-sm text-muted">
            Create action files in <code>.dialup/actions/</code> to get started.
          </p>
        </div>
      `;
    }

    return `
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Site</th>
            <th>Status</th>
            <th>Last Run</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${this.actions.map(action => `
            <tr>
              <td><strong>${action.name}</strong></td>
              <td>${action.type}</td>
              <td>${action.site}</td>
              <td>
                <span class="status ${action.status === 'active' ? 'status-running' : 'status-stopped'}">
                  ${action.status}
                </span>
              </td>
              <td>${action.lastRun ? new Date(action.lastRun).toLocaleString() : 'Never'}</td>
              <td>
                <div class="flex gap-2">
                  <button class="btn btn-sm btn-primary" onclick="alert('Execute action: ' + '${action.name}')">
                    Execute
                  </button>
                  <button class="btn btn-sm btn-secondary" onclick="alert('Edit action: ' + '${action.name}')">
                    Edit
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
}

customElements.define('deploy-actions', DeployActions);