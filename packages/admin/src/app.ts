// ABOUTME: Main DeployApp web component with client-side routing
// ABOUTME: Renders different views based on URL path (/, /settings, /actions, /sites/:id)

import { router, setupLinkInterception } from './router.js';
import './components/header.js';
import './components/sites.js';
import './components/actions.js';
import './components/settings.js';
import './components/site-detail.js';

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
    router.addRoute('/sites/:id', (params) => this.renderSiteDetail(params.id));
    router.setDefault(() => this.renderSites());
  }

  renderSites() {
    this.innerHTML = `
      <deploy-header></deploy-header>
      <main class="main-content">
        <deploy-sites></deploy-sites>
      </main>
    `;
  }

  renderSettings() {
    this.innerHTML = `
      <deploy-header></deploy-header>
      <main class="main-content">
        <deploy-settings></deploy-settings>
      </main>
    `;
  }

  renderActions() {
    this.innerHTML = `
      <deploy-header></deploy-header>
      <main class="main-content">
        <deploy-actions></deploy-actions>
      </main>
    `;
  }

  renderSiteDetail(siteId: string) {
    this.innerHTML = `
      <deploy-header></deploy-header>
      <main class="main-content">
        <deploy-site-detail site-id="${siteId}"></deploy-site-detail>
      </main>
    `;
  }
}

customElements.define('deploy-app', DeployApp);
