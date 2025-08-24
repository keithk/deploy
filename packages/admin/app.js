class DeployApp {
  constructor() {
    this.currentSection = 'dashboard';
    this.components = {
      'dashboard': 'deploy-dashboard',
      'sites': 'deploy-sites',
      'processes': 'deploy-processes',
      'actions': 'deploy-actions',
      'server': 'deploy-server'
    };
    
    // Make app globally available
    window.deployApp = this;
  }

  init() {
    // Initialize with dashboard
    this.showSection('dashboard');
    
    // Handle browser navigation
    window.addEventListener('popstate', (e) => {
      const section = e.state?.section || 'dashboard';
      this.showSection(section, false);
    });
    
    // Parse initial URL hash
    const hash = window.location.hash.substring(1);
    if (hash && this.components[hash]) {
      this.showSection(hash, false);
    }
  }

  showSection(section, pushState = true) {
    if (!this.components[section]) {
      console.warn('Unknown section:', section);
      return;
    }

    // Update current section
    this.currentSection = section;
    
    // Update main content
    const mainContent = document.getElementById('main-content');
    const componentTag = this.components[section];
    mainContent.innerHTML = `<${componentTag}></${componentTag}>`;
    
    // Update navigation active state
    const nav = document.querySelector('deploy-nav');
    if (nav) {
      const links = nav.querySelectorAll('.nav-link');
      links.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${section}`) {
          link.classList.add('active');
        }
      });
    }
    
    // Update URL and history
    if (pushState) {
      const url = section === 'dashboard' ? '/' : `#${section}`;
      history.pushState({ section }, '', url);
    }
    
    // Update page title
    document.title = `Deploy Admin - ${section.charAt(0).toUpperCase() + section.slice(1)}`;
  }

  async refreshData() {
    // Trigger refresh on current component
    const mainContent = document.getElementById('main-content');
    const currentComponent = mainContent.firstElementChild;
    
    if (currentComponent && typeof currentComponent.loadData === 'function') {
      await currentComponent.loadData();
    } else if (currentComponent && typeof currentComponent.loadSites === 'function') {
      await currentComponent.loadSites();
    } else if (currentComponent && typeof currentComponent.loadProcesses === 'function') {
      await currentComponent.loadProcesses();
    } else if (currentComponent && typeof currentComponent.loadActions === 'function') {
      await currentComponent.loadActions();
    } else if (currentComponent && typeof currentComponent.loadServerStatus === 'function') {
      await currentComponent.loadServerStatus();
    } else {
      // Fallback: recreate the component
      this.showSection(this.currentSection, false);
    }
  }

  // Utility method to show notifications (can be extended)
  notify(message, type = 'info') {
    // Simple alert for now, can be enhanced with toast notifications
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Could implement toast notifications here
    if (type === 'error') {
      alert('Error: ' + message);
    }
  }

  // API helper methods
  async apiRequest(url, options = {}) {
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
      }
      
      return await response.json();
    } catch (error) {
      this.notify(error.message, 'error');
      throw error;
    }
  }

  // Convenience methods for common API calls
  async getSites() {
    return this.apiRequest('/api/sites');
  }

  async createSite(data) {
    return this.apiRequest('/api/sites', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getProcesses() {
    return this.apiRequest('/api/processes');
  }

  async startProcess(id) {
    return this.apiRequest(`/api/processes/${id}/start`, { method: 'POST' });
  }

  async stopProcess(id) {
    return this.apiRequest(`/api/processes/${id}/stop`, { method: 'POST' });
  }

  async buildSite(name) {
    return this.apiRequest(`/api/sites/${name}/build`, { method: 'POST' });
  }

  async runSiteCommand(name, command) {
    return this.apiRequest(`/api/sites/${name}/run/${command}`, { method: 'POST' });
  }

  async getServerStatus() {
    return this.apiRequest('/api/server/status');
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const app = new DeployApp();
  app.init();
});

// Export for potential module usage
export default DeployApp;