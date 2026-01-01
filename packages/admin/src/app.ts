// ABOUTME: Main DeployApp web component with client-side routing
// ABOUTME: Renders different views based on URL path (/, /settings, /actions, /sites/:id/logs)

import { router, setupLinkInterception } from './router.js';
import './components/header.js';
import './components/sites.js';
import './components/actions.js';
import './components/settings.js';
import './components/site-logs.js';

class DeployApp extends HTMLElement {
  connectedCallback() {
    setupLinkInterception();
    this.setupRoutes();
    router.handleRoute();
  }

  setupRoutes() {
    router.addRoute('/', () => this.renderDashboard());
    router.addRoute('/settings', () => this.renderSettings());
    router.addRoute('/actions', () => this.renderActions());
    router.addRoute('/sites/:id/logs', (params) => this.renderLogs(params.id));
    router.setDefault(() => this.renderDashboard());
  }

  renderDashboard() {
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

  renderSettings() {
    this.innerHTML = `<deploy-settings></deploy-settings>`;
  }

  renderActions() {
    this.innerHTML = `
      <div class="container">
        <header class="flex items-center justify-between mb-4">
          <div>
            <h1 style="font-size: var(--font-size-5); font-weight: 600; color: var(--text-1);">
              Actions
            </h1>
          </div>
          <a href="/" data-route class="btn">
            Back to Dashboard
          </a>
        </header>

        <deploy-actions></deploy-actions>
      </div>
    `;
  }

  renderLogs(siteId: string) {
    this.innerHTML = `<site-logs site-id="${siteId}"></site-logs>`;
  }
}

customElements.define('deploy-app', DeployApp);
