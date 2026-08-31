// ABOUTME: CRT app header with navigation and display controls.
// ABOUTME: Provides site branding, keyboard shortcuts, scanline preference, and sign-out.

import { router } from '../router.js';

interface Settings {
  domain?: string;
}

// Nav destinations, keyed by the digit that jumps to them (⌘/Ctrl + digit).
const NAV_SHORTCUTS: Record<string, string> = {
  '1': '/',
  '2': '/deployments',
  '3': '/actions',
  '4': '/server',
  '5': '/settings',
};

class DeployHeader extends HTMLElement {
  private domain: string = '';
  private scanlinesEnabled = true;
  private handleShortcut = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const path = NAV_SHORTCUTS[e.key];
    if (!path) return;
    e.preventDefault();
    router.navigate(path);
  };

  connectedCallback() {
    this.scanlinesEnabled = localStorage.getItem('scanlines') !== 'off';
    this.applyScanlines();
    this.render();
    this.loadSettings();

    document.addEventListener('keydown', this.handleShortcut);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.handleShortcut);
  }

  async loadSettings() {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const settings: Settings = await response.json();
        this.domain = settings.domain || window.location.hostname;
        this.render();
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.domain = window.location.hostname;
      this.render();
    }
  }

  applyScanlines() {
    document.documentElement.setAttribute(
      'data-scanlines',
      this.scanlinesEnabled ? 'on' : 'off'
    );
  }

  toggleScanlines() {
    this.scanlinesEnabled = !this.scanlinesEnabled;
    localStorage.setItem('scanlines', this.scanlinesEnabled ? 'on' : 'off');
    this.applyScanlines();
    this.render();
  }

  getCurrentPath(): string {
    return window.location.pathname;
  }

  render() {
    const path = this.getCurrentPath();

    this.innerHTML = `
      <header class="app-header">
        <div class="header-inner">
          <a href="/" class="header-brand" data-route aria-label="Deploy home">
            <span class="header-brand-name">DEPLOY v2.4.1</span>
            <span class="header-brand-divider">//</span>
            <span class="header-brand-domain">${this.domain || window.location.hostname}</span>
          </a>
          <nav class="header-nav" aria-label="Primary navigation">
            <a href="/" class="nav-link ${path === '/' ? 'active' : ''}" data-route title="Sites (⌘1)">Sites</a>
            <a href="/deployments" class="nav-link ${path === '/deployments' ? 'active' : ''}" data-route title="Deploys (⌘2)">Deploys</a>
            <a href="/actions" class="nav-link ${path === '/actions' ? 'active' : ''}" data-route title="Actions (⌘3)">Actions</a>
            <a href="/server" class="nav-link ${path === '/server' ? 'active' : ''}" data-route title="Server (⌘4)">Server</a>
            <a href="/settings" class="nav-link ${path === '/settings' ? 'active' : ''}" data-route title="Config (⌘5)">Config</a>
          </nav>
          <div class="header-right">
            <button class="header-control ${this.scanlinesEnabled ? 'active' : ''}" id="scanlines-btn" aria-pressed="${this.scanlinesEnabled}" title="Toggle scanlines">SCAN ${this.scanlinesEnabled ? 'ON' : 'OFF'}</button>
            <button class="header-control" id="sign-out-btn">EXIT</button>
          </div>
        </div>
      </header>
    `;

    this.querySelector('#scanlines-btn')?.addEventListener('click', () => this.toggleScanlines());

    // Sign out handler
    this.querySelector('#sign-out-btn')?.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/login';
      } catch (error) {
        console.error('Logout failed:', error);
      }
    });
  }
}

customElements.define('deploy-header', DeployHeader);
