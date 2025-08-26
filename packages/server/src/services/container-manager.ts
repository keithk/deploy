import { spawn, ChildProcess } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { debug, info, warn, error } from '../utils/logging';
import type { SiteConfig } from '@keithk/deploy-core';

export interface ContainerConfig {
  name: string;
  sitePath: string;
  type: 'production' | 'preview';
  port: number;
  status: 'building' | 'running' | 'stopped' | 'failed';
  containerId?: string;
  buildPath?: string;
  strategy: 'railpack' | 'docker' | 'basic';
}

export interface RailpackPlan {
  deploy: {
    startCommand: string;
    variables: Record<string, string>;
  };
  steps: Array<{
    name: string;
    commands: Array<{
      cmd?: string;
      customName?: string;
    }>;
  }>;
}

export class ContainerManager {
  private containers = new Map<string, ContainerConfig>();
  private processes = new Map<string, ChildProcess>();
  private railpackPath: string;

  constructor(railpackPath = './railpack') {
    this.railpackPath = railpackPath;
    this.ensureContainerWorkspace();
    
    // Discover existing containers asynchronously
    this.discoverExistingContainers().catch(err => 
      warn(`Failed to discover existing containers: ${err}`)
    );
  }

  private ensureContainerWorkspace() {
    const workspaceDir = join(process.cwd(), '.deploy', 'containers');
    if (!existsSync(workspaceDir)) {
      mkdirSync(workspaceDir, { recursive: true });
    }
  }

  /**
   * Discovers existing Docker containers and registers them
   */
  private async discoverExistingContainers() {
    try {
      // Find all running Docker containers with deploy- prefix
      const { stdout } = await this.executeCommand(
        'docker ps --format "{{.Names}}\t{{.Ports}}" --filter name=default-production'
      );
      
      if (stdout.trim()) {
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const [name, ports] = line.split('\t');
          
          // Extract port mapping (e.g., "0.0.0.0:3001->3000/tcp")
          const portMatch = ports.match(/0\.0\.0\.0:(\d+)->/);
          if (portMatch) {
            const port = parseInt(portMatch[1], 10);
            
            debug(`Discovered existing Docker container: ${name} on port ${port}`);
            
            // Register the discovered container
            this.containers.set(name, {
              name,
              sitePath: '', // We don't know this from Docker
              type: name.includes('preview') ? 'preview' : 'production',
              port,
              status: 'running',
              strategy: 'docker'
            });
          }
        }
      }
    } catch (err) {
      debug(`Container discovery failed: ${err}`);
    }
  }

  /**
   * Analyzes a site using Railpack to get container configuration
   */
  async analyzeRailpackSite(sitePath: string): Promise<RailpackPlan | null> {
    try {
      const { stdout } = await this.executeCommand(
        `${this.railpackPath} plan ${sitePath}`
      );
      return JSON.parse(stdout) as RailpackPlan;
    } catch (err) {
      warn(`Failed to analyze site with Railpack: ${err}`);
      return null;
    }
  }

  /**
   * Creates and starts a container for a site
   */
  async createContainer(
    site: SiteConfig,
    type: 'production' | 'preview' = 'production'
  ): Promise<ContainerConfig> {
    console.log(`🔧 ContainerManager.createContainer debug:`);
    console.log(`  - Site: ${site.subdomain} (${site.type})`);
    console.log(`  - Type: ${type}`);
    
    const containerName = `${site.subdomain}-${type}`;
    console.log(`  - Container name: ${containerName}`);
    
    const port = this.allocatePort(site, type);
    console.log(`  - Allocated port: ${port}`);
    
    info(`Creating ${type} container for ${site.subdomain} on port ${port}`);

    // Determine containerization strategy
    console.log(`  - Determining strategy...`);
    const strategy = this.determineStrategy(site);
    console.log(`  - Strategy: ${strategy}`);

    const container: ContainerConfig = {
      name: containerName,
      sitePath: site.path,
      type,
      port,
      status: 'building',
      strategy
    };

    this.containers.set(containerName, container);

    try {
      switch (strategy) {
        case 'docker':
          await this.createDockerContainer(container, site);
          break;
        case 'railpack':
          const plan = await this.analyzeRailpackSite(site.path);
          if (plan) {
            await this.createRailpackContainer(container, site, plan);
          } else {
            // Fallback to basic if Railpack fails
            container.strategy = 'basic';
            await this.createBasicContainer(container, site);
          }
          break;
        case 'basic':
        default:
          await this.createBasicContainer(container, site);
          break;
      }

      container.status = 'running';
      info(`Container ${containerName} (${strategy}) is now running on port ${port}`);
      
    } catch (err) {
      container.status = 'failed';
      error(`Failed to create container ${containerName}: ${err}`);
      throw err;
    }

    return container;
  }

  /**
   * Determines the best containerization strategy for a site
   */
  private determineStrategy(site: SiteConfig): 'railpack' | 'docker' | 'basic' {
    // Docker sites always use Docker strategy
    if (site.type === 'docker') {
      return 'docker';
    }

    // Check for existing Dockerfile
    if (existsSync(join(site.path, 'Dockerfile'))) {
      return 'docker';
    }

    // Sites that explicitly disable containers use basic strategy
    if (site.useContainers === false) {
      return 'basic';
    }

    // For passthrough and dynamic sites, try Railpack first
    if (site.type === 'passthrough' || site.type === 'dynamic') {
      return 'railpack';
    }

    // Static sites use basic strategy by default
    return 'basic';
  }

  private async createRailpackContainer(
    container: ContainerConfig,
    site: SiteConfig,
    plan: RailpackPlan
  ) {
    // For now, we'll run the site directly with the detected command
    // Later we can integrate with Docker using the Railpack plan
    
    const startCommand = plan.deploy.startCommand;
    const envVars = { 
      ...process.env,
      ...plan.deploy.variables,
      PORT: container.port.toString()
    };

    debug(`Starting ${container.name} with command: ${startCommand}`);
    
    const childProcess = spawn('sh', ['-c', startCommand], {
      cwd: site.path,
      env: envVars,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.setupProcessHandlers(container, childProcess);
    this.processes.set(container.name, childProcess);
  }

  private async createDockerContainer(
    container: ContainerConfig,
    site: SiteConfig
  ) {
    const dockerFile = site.dockerFile || 'Dockerfile';
    const dockerContext = site.dockerContext || '.';
    const imageName = `deploy-${site.subdomain}:latest`;
    
    debug(`Building Docker image ${imageName} for ${container.name}`);
    
    // Clean up any existing container with the same name
    await this.cleanupExistingDockerContainer(container.name);
    
    // Build Docker image
    const buildChildProcess = spawn('docker', ['build', '-t', imageName, '-f', dockerFile, dockerContext], {
      cwd: site.path,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    await this.waitForProcess(buildChildProcess, `Docker build for ${container.name}`);

    // Run Docker container
    const runArgs = [
      'run', '-d', 
      '--name', container.name,
      '-p', `${container.port}:${site.exposedPort || 3000}`,
      '--rm' // Auto-remove when stopped
    ];

    // Add environment variables
    if (site.environment) {
      for (const [key, value] of Object.entries(site.environment)) {
        runArgs.push('-e', `${key}=${value}`);
      }
    }

    // Add Git integration environment variables if configured
    if (site.gitCloneUrl) {
      runArgs.push('-e', `GIT_CLONE_URL=${site.gitCloneUrl}`);
      debug(`Added GIT_CLONE_URL: ${site.gitCloneUrl}`);
    }
    if (site.gitBranch) {
      runArgs.push('-e', `GIT_BRANCH=${site.gitBranch}`);
      debug(`Added GIT_BRANCH: ${site.gitBranch}`);
    }

    runArgs.push(imageName);

    debug(`Starting Docker container: docker ${runArgs.join(' ')}`);

    const runChildProcess = spawn('docker', runArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Wait for Docker container to start successfully
    await this.waitForProcess(runChildProcess, `Docker run for ${container.name}`);

    // Verify the container is actually running and get its ID
    const { stdout: containerIdOutput } = await this.executeCommand(
      `docker ps -q --filter name=${container.name}`
    );
    
    if (containerIdOutput.trim()) {
      container.containerId = containerIdOutput.trim();
      debug(`Docker container ${container.name} started with ID: ${container.containerId}`);
    } else {
      throw new Error(`Docker container ${container.name} failed to start`);
    }
  }

  /**
   * Cleans up any existing Docker container with the same name
   */
  private async cleanupExistingDockerContainer(containerName: string): Promise<void> {
    try {
      // Check if container exists (running or stopped)
      const { stdout } = await this.executeCommand(
        `docker ps -aq -f name=${containerName}`
      );
      
      if (stdout.trim()) {
        debug(`Cleaning up existing Docker container: ${containerName}`);
        
        // Stop and remove the container
        await this.executeCommand(`docker stop ${containerName} || true`);
        await this.executeCommand(`docker rm ${containerName} || true`);
      }
    } catch (err) {
      // Ignore cleanup errors - container might not exist
      debug(`Container cleanup warning for ${containerName}: ${err}`);
    }
  }

  private waitForProcess(childProcess: ChildProcess, description: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';

      childProcess.stdout?.on('data', (data) => {
        output += data.toString();
        debug(`[${description}] ${data.toString().trim()}`);
      });

      childProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        warn(`[${description}] ${data.toString().trim()}`);
      });

      childProcess.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${description} failed with code ${code}: ${errorOutput}`));
        }
      });

      childProcess.on('error', reject);
    });
  }

  private async createBasicContainer(
    container: ContainerConfig,
    site: SiteConfig
  ) {
    // Basic container for sites without Railpack support
    // This handles static sites, custom setups, etc.
    
    if (site.commands) {
      const command = site.commands.start || site.commands.dev || '';
      if (command) {
        const envVars = {
          ...process.env,
          PORT: container.port.toString()
        };

        const childProcess = spawn('sh', ['-c', command], {
          cwd: site.path,
          env: envVars,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        this.setupProcessHandlers(container, childProcess);
        this.processes.set(container.name, childProcess);
        return;
      }
    }

    // Static file serving fallback
    await this.createStaticContainer(container, site);
  }

  private async createStaticContainer(
    container: ContainerConfig,
    site: SiteConfig
  ) {
    // Serve static files using a simple HTTP server
    const childProcess = spawn('python3', ['-m', 'http.server', container.port.toString()], {
      cwd: site.path,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.setupProcessHandlers(container, childProcess);
    this.processes.set(container.name, childProcess);
  }

  private setupProcessHandlers(container: ContainerConfig, childProcess: ChildProcess) {
    childProcess.stdout?.on('data', (data) => {
      debug(`[${container.name}] ${data.toString().trim()}`);
    });

    childProcess.stderr?.on('data', (data) => {
      warn(`[${container.name}] ${data.toString().trim()}`);
    });

    childProcess.on('exit', (code) => {
      if (code !== 0) {
        container.status = 'failed';
        error(`Container ${container.name} exited with code ${code}`);
      } else {
        container.status = 'stopped';
        info(`Container ${container.name} stopped normally`);
      }
      this.processes.delete(container.name);
    });

    childProcess.on('error', (err) => {
      container.status = 'failed';
      error(`Container ${container.name} error: ${err}`);
      this.processes.delete(container.name);
    });
  }

  /**
   * Allocates a port for a container
   */
  private allocatePort(site: SiteConfig, type: 'production' | 'preview'): number {
    // Use configured port or calculate based on site index + type offset
    let basePort = site.proxyPort || 3001; // Start from 3001 to avoid main server port (3000)
    
    // For default/home site, use a specific port to avoid conflicts
    if (site.subdomain === 'default' || site.default) {
      basePort = 3001;
    }
    
    const offset = type === 'preview' ? 1000 : 0;
    return basePort + offset;
  }

  /**
   * Stops a container
   */
  async stopContainer(containerName: string): Promise<void> {
    const container = this.containers.get(containerName);
    const childProcess = this.processes.get(containerName);

    // If container not in our registry, check if it's a running Docker container
    if (!container) {
      const isDockerRunning = await this.isDockerContainerRunning(containerName);
      if (isDockerRunning) {
        info(`Docker container ${containerName} found but not in registry, stopping directly`);
        try {
          await this.executeCommand(`docker stop ${containerName}`);
          debug(`Docker container ${containerName} stopped successfully`);
          return;
        } catch (err) {
          error(`Failed to stop unregistered Docker container ${containerName}: ${err}`);
          throw err;
        }
      }
      throw new Error(`Container ${containerName} not found`);
    }

    info(`Stopping container ${containerName} (strategy: ${container.strategy})`);

    // Handle Docker containers
    if (container.strategy === 'docker') {
      try {
        await this.executeCommand(`docker stop ${containerName}`);
        debug(`Docker container ${containerName} stopped successfully`);
      } catch (err) {
        warn(`Failed to stop Docker container ${containerName}: ${err}`);
        // Try force stop
        try {
          await this.executeCommand(`docker kill ${containerName}`);
          debug(`Docker container ${containerName} force killed`);
        } catch (killErr) {
          error(`Failed to force kill Docker container ${containerName}: ${killErr}`);
        }
      }
    }
    // Handle process-based containers
    else if (childProcess && !childProcess.killed) {
      childProcess.kill('SIGTERM');
      
      // Force kill after 5 seconds if not stopped
      setTimeout(() => {
        if (!childProcess.killed) {
          warn(`Force killing container ${containerName}`);
          childProcess.kill('SIGKILL');
        }
      }, 5000);
    }

    container.status = 'stopped';
  }

  /**
   * Restarts a container
   */
  async restartContainer(containerName: string): Promise<void> {
    const container = this.containers.get(containerName);
    if (!container) {
      throw new Error(`Container ${containerName} not found`);
    }

    await this.stopContainer(containerName);
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Find the site config and recreate
    // This is a simplified version - in practice we'd need to store site configs
    throw new Error('Restart not fully implemented - need to store site configs');
  }

  /**
   * Gets container status
   */
  getContainer(containerName: string): ContainerConfig | undefined {
    return this.containers.get(containerName);
  }

  /**
   * Lists all containers
   */
  listContainers(): ContainerConfig[] {
    return Array.from(this.containers.values());
  }

  /**
   * Checks if a Docker container is running (even if not in our registry)
   */
  private async isDockerContainerRunning(containerName: string): Promise<boolean> {
    try {
      const { stdout } = await this.executeCommand(
        `docker ps -q --filter name=^${containerName}$`
      );
      return stdout.trim() !== '';
    } catch (err) {
      return false;
    }
  }

  /**
   * Checks if a container exists and is running
   */
  async isContainerRunning(containerName: string): Promise<boolean> {
    const container = this.containers.get(containerName);
    
    // For Docker containers, check with Docker directly
    if (container?.strategy === 'docker') {
      return this.isDockerContainerRunning(containerName);
    }
    
    // If not in registry, check if it's a Docker container anyway
    if (!container) {
      return this.isDockerContainerRunning(containerName);
    }
    
    // For other containers, use our internal status
    return container?.status === 'running' || false;
  }

  private executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn('sh', ['-c', command]);
      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('exit', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      childProcess.on('error', reject);
    });
  }
}

// Singleton instance - lazy initialization to avoid circular dependency issues
let _containerManager: ContainerManager | undefined;
export const containerManager = {
  get instance(): ContainerManager {
    if (!_containerManager) {
      _containerManager = new ContainerManager();
    }
    return _containerManager;
  }
};