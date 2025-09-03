import { spawn, ChildProcess } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { debug, info, warn, error } from '../utils/logging';
import { detectSiteFramework } from '../../utils/railpack';
import type { SiteConfig } from "../../core";

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

// Using the RailpackPlan from utils/railpack
import type { RailpackPlan } from '../../utils/railpack';

export class ContainerManager {
  private containers = new Map<string, ContainerConfig>();
  private processes = new Map<string, ChildProcess>();
  private railpackPath: string;

  constructor(railpackPath = 'railpack') {
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
      // Find all running Docker containers with -production or -preview suffix
      const { stdout } = await this.executeCommand(
        'docker ps --format "{{.Names}}\t{{.Ports}}"'
      );
      
      if (stdout.trim()) {
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const [name, ports] = line.split('\t');
          
          if (!name || !ports) {
            continue; // Skip malformed lines
          }
          
          // Only include containers ending with -production or -preview
          if (!name.endsWith('-production') && !name.endsWith('-preview')) {
            continue;
          }
          
          // Extract port mapping (e.g., "0.0.0.0:3001->3000/tcp")
          const portMatch = ports.match(/0\.0\.0\.0:(\d+)->/);
          if (portMatch && portMatch[1]) {
            const port = parseInt(portMatch[1], 10);
            
            info(`Discovered existing Docker container: ${name} on port ${port}`);
            
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
    console.log(`  - Site Path: ${site.path}`);
    console.log(`  - Site Configuration: ${JSON.stringify(site, null, 2)}`);
    
    // Ensure site path exists and is valid
    if (!existsSync(site.path)) {
      console.error(`ERROR: Site path does not exist: ${site.path}`);
      error(`Site path does not exist: ${site.path}`);
      throw new Error(`Site path not found: ${site.path}`);
    }
    
    // Check Dockerfile
    const dockerfilePath = join(site.path, site.dockerFile || 'Dockerfile');
    if (!existsSync(dockerfilePath)) {
      console.warn(`No Dockerfile found at: ${dockerfilePath}`);
    }
    
    // Check package.json for possible issues
    const packageJsonPath = join(site.path, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        console.log('Package Scripts:', packageJson.scripts);
      } catch (err) {
        console.error(`Error reading package.json: ${err}`);
      }
    }
    
    const containerName = `${site.subdomain}-${type}`;
    console.log(`  - Container name: ${containerName}`);
    
    const port = this.allocatePort(site, type);
    console.log(`  - Allocated port: ${port}`);
    
    info(`Creating ${type} container for ${site.subdomain} on port ${port}`);

    // Determine containerization strategy
    console.log(`  - Determining strategy...`);
    const strategy = await this.determineStrategy(site);
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
          // Import railpack utilities
          console.log(`[DEBUG] Railpack strategy selected for ${container.name}`);
          const { getRailpackPlan } = await import('../../utils/railpack');
          const plan = await getRailpackPlan(site.path);
          console.log(`[DEBUG] Railpack plan generated:`, plan ? 'YES' : 'NO');
          if (plan) {
            console.log(`[DEBUG] Calling createRailpackContainer for ${container.name}`);
            await this.createRailpackContainer(container, site, plan);
          } else {
            // Fallback to basic if Railpack fails
            warn(`Railpack plan generation failed for ${site.subdomain}, falling back to basic strategy`);
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
  private async determineStrategy(site: SiteConfig): Promise<'railpack' | 'docker' | 'basic'> {
    // Check for existing Dockerfile first
    const hasDockerfile = existsSync(join(site.path, 'Dockerfile'));
    
    // Debug logging for strategy determination
    debug(`Determining container strategy for site: ${site.subdomain}`);
    debug(`Site path: ${site.path}`);
    debug(`Site type: ${site.type}`);
    debug(`Has Dockerfile: ${hasDockerfile}`);
    debug(`Use containers: ${site.useContainers}`);
    
    // Sites that explicitly disable containers use basic strategy
    if (site.useContainers === false) {
      info('Strategy: Basic (containers disabled)');
      return 'basic';
    }

    // If Dockerfile exists, use Docker strategy
    if (hasDockerfile) {
      info('Strategy: Docker (Dockerfile exists)');
      return 'docker';
    }
    
    // No Dockerfile - try Railpack first
    try {
      const { getRailpackPlan, isRailpackInstalled } = await import('../../utils/railpack');
      
      // Check if Railpack is installed and can handle this site
      if (await isRailpackInstalled()) {
        const plan = await getRailpackPlan(site.path);
        if (plan) {
          info('Strategy: Railpack (No Dockerfile, Railpack can build this site)');
          return 'railpack';
        }
      }
    } catch (err) {
      warn(`Railpack check failed: ${err}`);
    }
    
    // Fallback to framework detection
    try {
      const { detectSiteFramework } = await import('../../utils/railpack');
      
      const frameworkInfo = await detectSiteFramework(site.path);
      
      debug(`Framework Detection Result: ${JSON.stringify(frameworkInfo)}`);
      
      // For dynamic sites without Dockerfile, use railpack
      if (frameworkInfo.type === 'docker' || frameworkInfo.startCommand) {
        info('Strategy: Railpack (Dynamic site without Dockerfile)');
        return 'railpack';
      }
      
      // Static sites can use basic strategy
      if (frameworkInfo.type === 'static' || frameworkInfo.type === 'static-build') {
        info('Strategy: Basic (Static site)');
        return 'basic';
      }
    } catch (err) {
      warn(`Framework detection failed: ${err}`);
    }
    
    // Specific framework checks - use railpack when no Dockerfile
    const frameworkChecks = [
      { 
        files: ['Gemfile', '.ruby-version', 'config.ru'], 
        framework: 'ruby',
        strategy: 'railpack' as const 
      },
      { 
        files: ['next.config.js', 'nuxt.config.js', 'gatsby-config.js'], 
        framework: 'nextjs/nuxt/gatsby',
        strategy: 'railpack' as const 
      },
      { 
        files: ['app.py', 'requirements.txt', 'pyproject.toml'], 
        framework: 'python',
        strategy: 'railpack' as const 
      },
      { 
        files: ['server.js', 'app.js'], 
        framework: 'node',
        strategy: 'railpack' as const 
      }
    ];
    
    for (const check of frameworkChecks) {
      if (check.files.some(file => existsSync(join(site.path, file)))) {
        info(`Strategy: Docker (Detected ${check.framework} framework)`);
        return check.strategy;
      }
    }

    // Railpack strategy as a fallback
    if (await this.isRailpackSuitable(site.path)) {
      info('Strategy: Railpack (Generic dynamic site)');
      return 'railpack';
    }

    // For passthrough or dynamic sites, prefer Docker
    if (site.type === 'passthrough' || site.type === 'dynamic') {
      const strategy = hasDockerfile ? 'docker' : 'basic';
      info(`Strategy: ${strategy} (Passthrough/Dynamic site)`);
      return strategy;
    }

    // Static sites use basic strategy by default
    info('Strategy: Basic (Default fallback)');
    return 'basic';
  }

  /**
   * Additional check to see if Railpack is suitable for site
   */
  private async isRailpackSuitable(sitePath: string): Promise<boolean> {
    try {
      // Check for package.json or other build-related files
      const packageJsonPath = join(sitePath, 'package.json');
      const hasPackageJson = existsSync(packageJsonPath);
      
      if (hasPackageJson) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        const hasDevOrBuildScripts = !!(
          packageJson.scripts?.dev || 
          packageJson.scripts?.build || 
          packageJson.scripts?.start
        );
        
        return hasDevOrBuildScripts;
      }
      
      // Check for other framework config files
      const frameworkConfigs = [
        'astro.config.js', 
        'astro.config.mjs', 
        'vite.config.js', 
        '.babelrc', 
        'babel.config.js'
      ];
      
      return frameworkConfigs.some(config => existsSync(join(sitePath, config)));
    } catch (err) {
      warn(`Railpack suitability check failed: ${err}`);
      return false;
    }
  }

  /**
   * Create a temporary railpack.json config for preview containers
   * This allows us to customize the dev command with --host flag
   */
  private async createRailpackConfigForPreview(sitePath: string): Promise<void> {
    const configPath = join(sitePath, 'railpack.json');
    
    // Check if project already has a railpack.json
    if (existsSync(configPath)) {
      debug('Project already has railpack.json, skipping custom config creation');
      return;
    }
    
    // Detect the framework to determine the appropriate dev command
    const packageJsonPath = join(sitePath, 'package.json');
    let devCommand = 'npm run dev';
    
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        const hasAstro = packageJson.dependencies?.astro || packageJson.devDependencies?.astro;
        const hasVite = packageJson.dependencies?.vite || packageJson.devDependencies?.vite;
        const hasNext = packageJson.dependencies?.next || packageJson.devDependencies?.next;
        
        // Determine package manager
        const hasBun = existsSync(join(sitePath, 'bun.lockb'));
        const hasYarn = existsSync(join(sitePath, 'yarn.lock'));
        const hasPnpm = existsSync(join(sitePath, 'pnpm-lock.yaml'));
        
        let pm = 'npm';
        if (hasBun) pm = 'bun';
        else if (hasYarn) pm = 'yarn';
        else if (hasPnpm) pm = 'pnpm';
        
        // Build the dev command with --host flag and allowed hosts
        // Note: We need to use the direct command, not npm run, for proper flag passing
        // For preview containers, we allow all hosts since the subdomain is dynamic
        if (hasAstro) {
          // Astro supports --allowed-hosts flag to bypass host header validation
          devCommand = `astro dev --host --port $PORT --allowed-hosts`;
        } else if (hasVite) {
          // For pure Vite, we might need a different approach
          // Vite doesn't have a direct CLI flag for allowed hosts
          devCommand = `vite --host --port $PORT`;
        } else if (hasNext) {
          // Next.js uses -H for host and -p for port
          devCommand = `next dev -H 0.0.0.0 -p $PORT`;
        } else if (packageJson.scripts?.dev) {
          // For generic dev scripts, we'll use the package manager
          // This might not work perfectly for all frameworks but is a fallback
          devCommand = `${pm === 'bun' ? 'bun' : pm + ' run'} dev`;
        }
        
        info(`Using custom dev command for preview: ${devCommand}`);
      } catch (err) {
        warn(`Failed to parse package.json: ${err}`);
      }
    }
    
    // Create the railpack.json config
    const railpackConfig = {
      "$schema": "https://schema.railpack.com",
      "deploy": {
        "startCommand": devCommand
      }
    };
    
    try {
      writeFileSync(configPath, JSON.stringify(railpackConfig, null, 2));
      info(`Created temporary railpack.json for preview container at ${configPath}`);
    } catch (err) {
      error(`Failed to write railpack.json: ${err}`);
    }
  }
  
  /**
   * Clean up temporary railpack.json after build
   */
  private cleanupRailpackConfig(sitePath: string): void {
    const configPath = join(sitePath, 'railpack.json');
    
    // Only remove if it's our generated config (check for our specific structure)
    if (existsSync(configPath)) {
      try {
        const content = JSON.parse(readFileSync(configPath, 'utf8'));
        // Check if this is our minimal config (only has deploy.startCommand)
        if (content.$schema === "https://schema.railpack.com" && 
            Object.keys(content).length === 2 && 
            content.deploy && 
            Object.keys(content.deploy).length === 1 &&
            content.deploy.startCommand) {
          unlinkSync(configPath);
          debug('Cleaned up temporary railpack.json');
        }
      } catch (err) {
        // Ignore cleanup errors
        debug(`Failed to cleanup railpack.json: ${err}`);
      }
    }
  }

  private async createRailpackContainer(
    container: ContainerConfig,
    site: SiteConfig,
    plan: RailpackPlan
  ) {
    try {
      const imageName = `deploy-${container.name}:latest`;
      
      console.log(`[DEBUG] createRailpackContainer called for ${container.name}`);
      info(`Starting Railpack container creation for ${container.name}`);
      
      // For preview containers, create a custom railpack.json with --host flag
      if (container.type === 'preview') {
        await this.createRailpackConfigForPreview(site.path);
      }
      
      // Import the railpack utility
      const { buildWithRailpack } = await import('../../utils/railpack');
      
      info(`Building Docker image with Railpack for ${container.name}`);
    
    // For preview containers, build with dev environment
    const buildEnv = container.type === 'preview' ? {
      NODE_ENV: 'development',
      PORT: (site.exposedPort || 3000).toString(),
      ...site.environment
    } : {
      NODE_ENV: 'production', 
      PORT: container.port.toString(),
      ...site.environment
    };
    
    // Build the Docker image using Railpack
    console.log(`[DEBUG] Calling buildWithRailpack for ${imageName}`);
    const buildSuccess = await buildWithRailpack(site.path, imageName, {
      env: buildEnv
    });
    
    console.log(`[DEBUG] buildWithRailpack returned:`, buildSuccess);
    
    // Clean up temporary railpack.json if we created one
    if (container.type === 'preview') {
      this.cleanupRailpackConfig(site.path);
    }
    
    if (!buildSuccess) {
      throw new Error(`Failed to build Docker image with Railpack for ${container.name}`);
    }
    
    // Run the Docker container from the built image
    console.log(`[DEBUG] About to run Docker container from image: ${imageName}`);
    info(`Running Docker container from Railpack-built image: ${imageName}`);
    
    // Clean up any existing container
    try {
      console.log(`[DEBUG] Cleaning up existing container: ${container.name}`);
      await this.cleanupExistingDockerContainer(container.name);
      console.log(`[DEBUG] Cleanup complete`);
    } catch (cleanupErr) {
      console.log(`[DEBUG] Cleanup error:`, cleanupErr);
      warn(`Failed to cleanup existing container: ${cleanupErr}`);
    }
    
    // Use the deploy start command from the railpack plan
    let runCommand = plan.deploy?.startCommand || 'npm start';
    
    // For Ruby apps with Puma, ensure we bind to the correct port
    if (runCommand.includes('puma')) {
      // Puma uses the PORT environment variable by default
      // No need to modify the command, just ensure PORT is set
    } else if (existsSync(join(site.path, 'Gemfile')) && container.type === 'preview') {
      // For other Ruby apps in dev mode, use rackup
      runCommand = `bundle exec rackup -o 0.0.0.0 -p ${site.exposedPort || site.proxyPort || 3000}`;
    }
    
    // Run the container
    const runArgs = [
      'run', '-d',
      '--name', container.name,
      '-p', `${container.port}:${site.exposedPort || site.proxyPort || 3000}`,
      '--rm',
      '-e', `PORT=${site.exposedPort || site.proxyPort || 3000}`,
      '-e', `NODE_ENV=${container.type === 'preview' ? 'development' : 'production'}`
    ];
    
    // For preview containers, mount only the source files, not the entire directory
    // This preserves the container's installed dependencies
    if (container.type === 'preview') {
      // Detect framework type from the plan
      const isRuby = plan.deploy?.startCommand?.includes('ruby') || 
                     plan.deploy?.startCommand?.includes('puma') ||
                     plan.deploy?.startCommand?.includes('rackup');
      
      if (isRuby) {
        // Mount Ruby-specific files/directories to preserve bundled gems
        if (existsSync(join(site.path, 'app.rb'))) {
          runArgs.push('-v', `${site.path}/app.rb:/app/app.rb`);
        }
        if (existsSync(join(site.path, 'views'))) {
          runArgs.push('-v', `${site.path}/views:/app/views`);
        }
        if (existsSync(join(site.path, 'public'))) {
          runArgs.push('-v', `${site.path}/public:/app/public`);
        }
        if (existsSync(join(site.path, 'config.ru'))) {
          runArgs.push('-v', `${site.path}/config.ru:/app/config.ru`);
        }
      } else {
        // For non-Ruby apps, mount the source directory but exclude node_modules
        // This is safer for JS/TS projects that need hot reload
        console.log('[DEBUG] Not mounting volumes for non-Ruby container in preview mode');
        // We don't mount volumes for Astro/Next.js as they handle their own build process
      }
    }
    
    // Add environment variables
    if (site.environment) {
      for (const [key, value] of Object.entries(site.environment)) {
        runArgs.push('-e', `${key}=${value}`);
      }
    }
    
    // Add the image
    runArgs.push(imageName);
    
    // For Ruby preview containers, use puma with hot reload support
    if (container.type === 'preview' && plan.deploy?.startCommand?.includes('puma')) {
      // Override command to use puma with hot reload in development
      runArgs.push('bundle', 'exec', 'puma', '-C', 'config/puma.rb', '--prune-bundler');
    }
    // Otherwise, let railpack's default command run
    
    const dockerCommand = `docker ${runArgs.join(' ')}`;
    debug(`Docker run command: ${dockerCommand}`);
    console.log(`[DEBUG] Full docker command: ${dockerCommand}`);
    
    try {
      console.log(`[DEBUG] Executing docker run command`);
      await this.executeCommand(dockerCommand);
      console.log(`[DEBUG] Docker run command completed`);
      info(`Docker container ${container.name} started successfully`);
      container.containerId = container.name;
    } catch (err) {
      console.error(`[DEBUG] Docker run failed:`, err);
      error(`Failed to run Docker container: ${err}`);
      throw err;
    }
    } catch (mainErr) {
      console.error(`[DEBUG] createRailpackContainer failed:`, mainErr);
      error(`Failed in createRailpackContainer: ${mainErr}`);
      
      // Clean up temporary railpack.json if we created one
      if (container.type === 'preview') {
        this.cleanupRailpackConfig(site.path);
      }
      
      throw mainErr;
    }
  }
  
  private async createDevContainer(
    container: ContainerConfig,
    site: SiteConfig
  ) {
    // Clean up any existing container with the same name
    await this.cleanupExistingDockerContainer(container.name);
    
    // Import required utilities
    const { detectSiteFramework } = await import('../../utils/railpack');
    const { detectPackageManager } = await import('../../core/utils/packageManager');
    
    // Detect framework and package manager
    const frameworkInfo = await detectSiteFramework(site.path);
    const packageManager = detectPackageManager(site.path);
    
    debug(`Detected framework: ${frameworkInfo.framework}, Package Manager: ${packageManager}`);
    
    // Determine best dev command
    let devCommand = 'npm run dev'; // Default fallback
    
    if (frameworkInfo.framework === 'astro') {
      devCommand = 'bun dev';
    } else if (frameworkInfo.framework === 'nextjs') {
      devCommand = 'bun run dev';
    } else if (packageManager === 'bun') {
      devCommand = 'bun dev';
    }
    
    // Prefer explicit dev command from package.json if available
    if (site.commands?.dev) {
      devCommand = site.commands.dev;
    }
    
    // Run Docker container with volume mount for hot reloading
    const runArgs = [
      'run', '-d',
      '--name', container.name,
      '-p', `${container.port}:${site.exposedPort || 3000}`,
      '--rm', // Auto-remove when stopped
      '-v', `${site.path}:/app`, // Mount for hot reloading
      '-w', '/app' // Set working directory
    ];
    
    // Add environment variables
    const envVars = {
      ...site.environment,
      PORT: `${site.exposedPort || 3000}`,
      HOST: '0.0.0.0',
      NODE_ENV: 'development'
    };
    
    for (const [key, value] of Object.entries(envVars)) {
      runArgs.push('-e', `${key}=${value}`);
    }
    
    // Use a base image suitable for the framework
    const baseImage = frameworkInfo.framework === 'ruby' 
      ? 'ruby:3.2' 
      : 'oven/bun:latest'; // Bun is versatile for many JS/TS projects
    
    runArgs.push(baseImage);
    
    // Prepare install and dev command
    let setupCmd = '';
    
    switch (packageManager) {
      case 'bun':
        setupCmd = `bun install && ${devCommand}`;
        break;
      case 'npm':
        setupCmd = `npm install && ${devCommand}`;
        break;
      case 'yarn':
        setupCmd = `yarn install && ${devCommand}`;
        break;
      case 'pnpm':
        setupCmd = `pnpm install && ${devCommand}`;
        break;
      default:
        setupCmd = devCommand; // Fallback if no package manager detected
    }
    
    // For Ruby, use different install command
    if (frameworkInfo.framework === 'ruby') {
      setupCmd = `bundle install && ${devCommand}`;
    }
    
    debug(`Dev setup command: ${setupCmd}`);
    
    runArgs.push('sh', '-c', setupCmd);
    
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
  
  private async runDevContainerWithRailpack(
    container: ContainerConfig,
    site: SiteConfig,
    imageName: string,
    plan: RailpackPlan
  ) {
    // Clean up any existing container with the same name
    await this.cleanupExistingDockerContainer(container.name);
    
    const runArgs = [
      'run', '-d',
      '--name', container.name,
      '-p', `${container.port}:${site.exposedPort || 3000}`,
      '--rm', // Auto-remove when stopped
      '-v', `${site.path}:/app`, // Mount for hot reloading in dev mode
      '-w', '/app' // Set working directory
    ];
    
    // Add environment variables for dev mode
    const envVars = {
      ...site.environment,
      PORT: `${site.exposedPort || 3000}`,
      HOST: '0.0.0.0',
      NODE_ENV: 'development'
    };
    
    for (const [key, value] of Object.entries(envVars)) {
      runArgs.push('-e', `${key}=${value}`);
    }
    
    // Add the railpack-built image
    runArgs.push(imageName);
    
    // Check if there's a dev command in the plan, otherwise use default dev command
    let devCommand: string | undefined;
    
    // Look for a dev command in the plan
    if (plan.steps) {
      for (const step of plan.steps) {
        if (step.name === 'dev' && step.commands?.[0]?.cmd) {
          devCommand = step.commands[0].cmd;
          break;
        }
      }
    }
    
    // If no dev command in plan, try to use site.commands.dev or detect from package.json
    if (!devCommand) {
      if (site.commands?.dev) {
        devCommand = site.commands.dev;
      } else {
        // Try common dev commands based on detected framework
        const { detectSiteFramework } = await import('../../utils/railpack');
        const frameworkInfo = await detectSiteFramework(site.path);
        
        if (frameworkInfo.framework === 'astro') {
          devCommand = 'bun dev';
        } else if (frameworkInfo.framework === 'nextjs') {
          devCommand = 'bun run dev';
        } else {
          devCommand = 'bun run dev';
        }
      }
    }
    
    // Override the container command to run dev mode
    if (devCommand) {
      runArgs.push('sh', '-c', devCommand);
    }
    
    debug(`Starting Railpack dev container: docker ${runArgs.join(' ')}`);
    
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
      debug(`Railpack dev container ${container.name} started with ID: ${container.containerId}`);
    } else {
      throw new Error(`Railpack dev container ${container.name} failed to start`);
    }
  }
  
  private async runProductionContainer(
    container: ContainerConfig,
    site: SiteConfig,
    imageName: string,
    _plan: RailpackPlan
  ) {
    // Clean up any existing container with the same name
    await this.cleanupExistingDockerContainer(container.name);
    
    const runArgs = [
      'run', '-d',
      '--name', container.name,
      '-p', `${container.port}:${site.exposedPort || 3000}`,
      '--rm' // Auto-remove when stopped
    ];
    
    // Add environment variables
    const envVars = {
      ...site.environment,
      PORT: `${site.exposedPort || 3000}`,
      HOST: '0.0.0.0', // Ensure server binds to all interfaces
      NODE_ENV: 'production'
    };
    
    for (const [key, value] of Object.entries(envVars)) {
      runArgs.push('-e', `${key}=${value}`);
    }
    
    // Add the image - railpack-built images have their own entrypoint/cmd configured
    runArgs.push(imageName);
    
    debug(`Starting Railpack production container: docker ${runArgs.join(' ')}`);
    
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
      debug(`Railpack production container ${container.name} started with ID: ${container.containerId}`);
    } else {
      throw new Error(`Railpack production container ${container.name} failed to start`);
    }
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

    // For preview containers, mount the site directory for live file updates
    if (container.type === 'preview') {
      runArgs.push('-v', `${site.path}:/app`);
      debug(`Preview container mounting: ${site.path}:/app`);
    }

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

    // For preview containers, override the command to use dev mode
    if (container.type === 'preview') {
      // Check if site has mise configuration
      const { detectPackageManager } = await import('../../core/utils/packageManager');
      const packageManager = detectPackageManager(site.path);
      
      if (packageManager === 'mise') {
        runArgs.push(imageName, 'mise', 'run', 'dev');
        debug(`Preview container using mise: mise run dev`);
      } else {
        // Fall back to traditional package manager dev command
        runArgs.push(imageName, 'bun', 'run', 'dev');
        debug(`Preview container using fallback: bun run dev`);
      }
    } else {
      runArgs.push(imageName);
    }

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

  /**
   * Waits for a container to be healthy and ready to serve traffic
   */
  async waitForContainerHealth(containerName: string, maxWaitMs: number = 30000): Promise<boolean> {
    const container = this.containers.get(containerName);
    if (!container) {
      return false;
    }

    const startTime = Date.now();
    const healthCheckUrl = `http://localhost:${container.port}/`;
    
    debug(`Waiting for container ${containerName} to be healthy at ${healthCheckUrl}`);
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        // Check if container is still running first
        const isRunning = await this.isContainerRunning(containerName);
        if (!isRunning) {
          warn(`Container ${containerName} stopped during health check`);
          return false;
        }

        // Try to fetch from the container's health endpoint
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        try {
          const response = await fetch(healthCheckUrl, {
            method: 'GET',
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        
          if (response.ok) {
            info(`Container ${containerName} is healthy and ready`);
            return true;
          }
          
          debug(`Health check failed for ${containerName}: ${response.status}`);
        } catch (err) {
          clearTimeout(timeoutId);
          debug(`Health check error for ${containerName}: ${err}`);
        }
      } catch (outerErr) {
        debug(`Health check outer error for ${containerName}: ${outerErr}`);
      }
      
      // Wait 500ms before next check
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    warn(`Container ${containerName} failed to become healthy within ${maxWaitMs}ms`);
    return false;
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