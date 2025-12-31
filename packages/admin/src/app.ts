// ABOUTME: Main DeployApp web component that renders the dashboard layout
// ABOUTME: Contains header, sites section, and actions section

import './components/header.js';
import './components/sites.js';
import './components/actions.js';

class DeployApp extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  render() {
    this.innerHTML = `
      <div class="container">
        <deploy-header></deploy-header>

        <div style="margin-top: var(--size-5);">
          <deploy-sites></deploy-sites>
        </div>

        <div style="margin-top: var(--size-5);">
          <deploy-actions></deploy-actions>
        </div>
      </div>
    `;
  }
}

customElements.define('deploy-app', DeployApp);
