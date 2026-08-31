// ABOUTME: Main DeployApp web component with client-side routing
// ABOUTME: Renders different views based on URL path (/, /settings, /actions, /sites/:id)

import { router, setupLinkInterception } from './router.js';
import './components/header.js';
import './components/sites.js';
import './components/actions.js';
import './components/settings.js';
import './components/site-detail.js';
import './components/site-deploys.js';
import './components/site-metrics.js';
import './components/deployments.js';
import './components/toast.js';
import './components/confirm-dialog.js';
import './components/input-dialog.js';

class DeployApp extends HTMLElement {
  connectedCallback() {
    setupLinkInterception();
    this.setupRoutes();
    router.handleRoute();
  }

  setupRoutes() {
    router.addRoute('/', () => this.renderSites());
    router.addRoute('/settings', () => this.renderSettings());
    router.addRoute('/actions', () => this.renderActions());
    router.addRoute('/deployments', () => this.renderDeployments());
    router.addRoute('/sites/:id', (params) => this.renderSiteDetail(params.id));
    router.setDefault(() => this.renderSites());
  }

  renderSites() {
    document.title = 'Sites · deploy';
    this.innerHTML = `
      <deploy-header></deploy-header>
      <main class="main-content">
        <deploy-sites></deploy-sites>
      </main>
    `;
  }

  renderSettings() {
    document.title = 'Settings · deploy';
    this.innerHTML = `
      <deploy-header></deploy-header>
      <main class="main-content">
        <deploy-settings></deploy-settings>
      </main>
    `;
  }

  renderActions() {
    document.title = 'Actions · deploy';
    this.innerHTML = `
      <deploy-header></deploy-header>
      <main class="main-content">
        <deploy-actions></deploy-actions>
      </main>
    `;
  }

  renderSiteDetail(siteId: string) {
    document.title = 'Site · deploy';
    this.innerHTML = `
      <deploy-header></deploy-header>
      <main class="main-content">
        <deploy-site-detail site-id="${siteId}"></deploy-site-detail>
      </main>
    `;
  }

  renderDeployments() {
    document.title = 'Deployments · deploy';
    this.innerHTML = `
      <deploy-header></deploy-header>
      <main class="main-content">
        <deploy-deployments></deploy-deployments>
      </main>
    `;
  }
}

customElements.define('deploy-app', DeployApp);
