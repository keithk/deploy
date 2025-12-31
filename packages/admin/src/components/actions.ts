// ABOUTME: Actions component placeholder for displaying deployment actions
// ABOUTME: Similar structure to sites component, to be implemented later

class DeployActions extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  render() {
    this.innerHTML = `
      <div class="actions-section">
        <h2 style="font-size: var(--font-size-4); font-weight: 600; color: var(--text-1); margin-bottom: var(--size-4);">
          Recent Actions
        </h2>

        <div class="card" style="text-align: center; padding: var(--size-5);">
          <p class="text-muted">
            No recent actions to display.
          </p>
        </div>
      </div>
    `;
  }
}

customElements.define('deploy-actions', DeployActions);
