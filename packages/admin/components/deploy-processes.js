class DeployProcesses extends HTMLElement {
  constructor() {
    super();
    this.processes = [];
  }

  connectedCallback() {
    this.render();
    this.loadProcesses();
    
    // Auto-refresh every 5 seconds
    this.intervalId = setInterval(() => {
      this.loadProcesses();
    }, 5000);
  }

  disconnectedCallback() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async loadProcesses() {
    try {
      const response = await fetch('/api/processes');
      if (response.ok) {
        this.processes = await response.json();
        this.render();
      }
    } catch (error) {
      console.error('Failed to load processes:', error);
    }
  }

  async startProcess(processId) {
    try {
      const response = await fetch(`/api/processes/${processId}/start`, {
        method: 'POST'
      });
      
      if (response.ok) {
        this.loadProcesses(); // Refresh the list
      } else {
        const error = await response.json();
        alert('Failed to start process: ' + error.error);
      }
    } catch (error) {
      console.error('Failed to start process:', error);
      alert('Failed to start process');
    }
  }

  async stopProcess(processId) {
    try {
      const response = await fetch(`/api/processes/${processId}/stop`, {
        method: 'POST'
      });
      
      if (response.ok) {
        this.loadProcesses(); // Refresh the list
      } else {
        const error = await response.json();
        alert('Failed to stop process: ' + error.error);
      }
    } catch (error) {
      console.error('Failed to stop process:', error);
      alert('Failed to stop process');
    }
  }

  render() {
    const runningProcesses = this.processes.filter(p => p.status === 'running');
    const stoppedProcesses = this.processes.filter(p => p.status !== 'running');

    this.innerHTML = `
      <div class="processes-manager">
        <h1 class="mb-4" style="font-size: 1.875rem; font-weight: 700;">Processes</h1>
        
        <!-- Process Stats -->
        <div class="grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
          <div class="card">
            <div class="card-content">
              <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">Running</h3>
              <div style="font-size: 1.5rem; font-weight: 700; color: #059669;">${runningProcesses.length}</div>
            </div>
          </div>
          
          <div class="card">
            <div class="card-content">
              <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">Stopped</h3>
              <div style="font-size: 1.5rem; font-weight: 700; color: #dc2626;">${stoppedProcesses.length}</div>
            </div>
          </div>
          
          <div class="card">
            <div class="card-content">
              <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">Total</h3>
              <div style="font-size: 1.5rem; font-weight: 700; color: #2563eb;">${this.processes.length}</div>
            </div>
          </div>
        </div>
        
        <!-- Running Processes -->
        ${runningProcesses.length > 0 ? `
          <div class="card mb-4">
            <div class="card-header">
              <h2>Running Processes</h2>
            </div>
            <div class="card-content">
              ${this.renderProcessTable(runningProcesses)}
            </div>
          </div>
        ` : ''}
        
        <!-- All Processes -->
        <div class="card">
          <div class="card-header">
            <h2>All Processes</h2>
          </div>
          <div class="card-content">
            ${this.renderProcessTable(this.processes)}
          </div>
        </div>
      </div>
    `;
  }

  renderProcessTable(processes) {
    if (processes.length === 0) {
      return '<p class="text-muted">No processes found.</p>';
    }

    return `
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Site</th>
            <th>Status</th>
            <th>Port</th>
            <th>Type</th>
            <th>PID</th>
            <th>Started</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${processes.map(process => `
            <tr>
              <td>${process.id}</td>
              <td><strong>${process.site}</strong></td>
              <td>
                <span class="status ${process.status === 'running' ? 'status-running' : 'status-stopped'}">
                  ${process.status}
                </span>
              </td>
              <td>${process.port}</td>
              <td>${process.type}</td>
              <td>${process.pid || '-'}</td>
              <td>${process.startedAt ? new Date(process.startedAt).toLocaleString() : '-'}</td>
              <td>
                <div class="flex gap-2">
                  ${process.status === 'running' ? `
                    <button class="btn btn-sm btn-danger" onclick="this.closest('deploy-processes').stopProcess(${process.id})">
                      Stop
                    </button>
                  ` : `
                    <button class="btn btn-sm btn-primary" onclick="this.closest('deploy-processes').startProcess(${process.id})">
                      Start
                    </button>
                  `}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
}

customElements.define('deploy-processes', DeployProcesses);