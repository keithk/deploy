class DeployHeader extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.innerHTML = `
      <div class="flex items-center justify-between">
        <h1>Deploy Admin</h1>
        <div class="flex items-center gap-4">
          <span class="text-sm">Dial Up Deploy</span>
          <button class="btn btn-sm btn-secondary" onclick="window.deployApp.refreshData()">
            Refresh
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('deploy-header', DeployHeader);