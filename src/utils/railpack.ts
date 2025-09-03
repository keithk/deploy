/**
 * Railpack Integration for Site Detection and Building
 * Uses Railpack CLI to detect frameworks and generate build plans
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import type { SiteConfig } from '../types/site';
import { debug, info, warn, error } from './logging';

const execAsync = promisify(spawn);
const BUILDER_NAME = 'deploy-railpack-builder';

export interface RailpackPlan {
  $schema?: string;
  steps?: Array<{
    name: string;
    commands?: Array<{
      cmd?: string;
      dest?: string;
      src?: string;
      path?: string;
      customName?: string;
    }>;
    inputs?: Array<{
      step?: string;
      image?: string;
    }>;
    caches?: string[];
    variables?: Record<string, string>;
  }>;
  deploy?: {
    startCommand?: string;
    base?: {
      image?: string;
    };
    inputs?: Array<{
      include: string[];
      step: string;
    }>;
    variables?: Record<string, string>;
  };
  caches?: Record<string, {
    directory: string;
    type: string;
  }>;
}

/**
 * Check if Railpack CLI is installed
 */
export async function isRailpackInstalled(): Promise<boolean> {
  try {
    const result = await new Promise<boolean>((resolve) => {
      const proc = spawn('railpack', ['--version'], { 
        shell: true,
        stdio: 'pipe' 
      });
      
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      
      proc.on('error', () => {
        resolve(false);
      });
    });
    
    return result;
  } catch {
    return false;
  }
}

/**
 * Get the actual BuildKit container name
 */
async function getBuildKitContainerName(): Promise<string | null> {
  try {
    const result = await new Promise<string>((resolve) => {
      let output = '';
      const proc = spawn('docker', ['ps', '--format', '{{.Names}}', '--filter', `name=${BUILDER_NAME}`], {
        stdio: 'pipe'
      });
      
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      proc.on('close', () => {
        resolve(output.trim());
      });
      
      proc.on('error', () => {
        resolve('');
      });
    });
    
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Ensure BuildKit builder is set up for Railpack
 */
async function ensureBuildKitSetup(): Promise<string | null> {
  try {
    // Check if builder already exists
    const checkResult = await new Promise<boolean>((resolve) => {
      const proc = spawn('docker', ['buildx', 'inspect', BUILDER_NAME], {
        stdio: 'pipe'
      });
      
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      
      proc.on('error', () => {
        resolve(false);
      });
    });
    
    if (!checkResult) {
      info(`Creating BuildKit builder: ${BUILDER_NAME}`);
      
      // Create the builder
      const createArgs = [
        'buildx', 'create',
        '--use',
        '--name', BUILDER_NAME,
        '--driver', 'docker-container',
        '--buildkitd-flags', '--allow-insecure-entitlement network.host'
      ];
      
      const createResult = await new Promise<boolean>((resolve) => {
        const proc = spawn('docker', createArgs, {
          stdio: 'pipe'
        });
        
        proc.on('close', (code) => {
          resolve(code === 0);
        });
        
        proc.on('error', () => {
          resolve(false);
        });
      });
      
      if (!createResult) {
        error('Failed to create BuildKit builder');
        return null;
      }
    }
    
    // Bootstrap the builder to ensure it's running
    const bootstrapResult = await new Promise<boolean>((resolve) => {
      const proc = spawn('docker', ['buildx', 'inspect', BUILDER_NAME, '--bootstrap'], {
        stdio: 'pipe'
      });
      
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      
      proc.on('error', () => {
        resolve(false);
      });
    });
    
    if (!bootstrapResult) {
      error('Failed to bootstrap BuildKit builder');
      return null;
    }
    
    // Get the actual container name
    const containerName = await getBuildKitContainerName();
    if (!containerName) {
      error('Failed to get BuildKit container name');
      return null;
    }
    
    debug(`BuildKit builder ${BUILDER_NAME} is ready with container: ${containerName}`);
    return containerName;
  } catch (err) {
    error(`Failed to set up BuildKit: ${err}`);
    return null;
  }
}

/**
 * Get Railpack build plan for a site
 */
export async function getRailpackPlan(sitePath: string): Promise<RailpackPlan | null> {
  if (!await isRailpackInstalled()) {
    warn('Railpack CLI not installed - skipping framework detection');
    return null;
  }
  
  try {
    const result = await new Promise<string>((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      
      debug(`Generating Railpack plan for site: ${sitePath}`);
      
      // Railpack outputs plan as JSON
      const proc = spawn('railpack', ['plan', sitePath], {
        shell: true,
        stdio: 'pipe'
      });
      
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      proc.stderr?.on('data', (data) => {
        const dataStr = data.toString();
        errorOutput += dataStr;
        warn(`Railpack plan stderr: ${dataStr}`);
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          try {
            // Additional validation of JSON output
            const parsedOutput = JSON.parse(output);
            
            // Perform some basic sanity checks
            if (!parsedOutput || (parsedOutput.steps && !Array.isArray(parsedOutput.steps))) {
              throw new Error('Invalid Railpack plan structure');
            }
            
            resolve(output);
          } catch (parseErr) {
            error(`Failed to parse Railpack plan JSON: ${parseErr}`);
            reject(parseErr);
          }
        } else {
          const detailedError = `Railpack plan failed with code ${code}: ${errorOutput}`;
          error(detailedError);
          reject(new Error(detailedError));
        }
      });
      
      proc.on('error', (err) => {
        const processError = `Railpack plan process error: ${err}`;
        error(processError);
        reject(err);
      });
    });
    
    // Parse the JSON output
    const plan = JSON.parse(result) as RailpackPlan;
    
    // Log successful plan generation
    debug(`Successfully generated Railpack plan for ${sitePath}`);
    
    return plan;
  } catch (err) {
    error(`Comprehensive failure in Railpack plan generation for ${sitePath}: ${err}`);
    return null;
  }
}

/**
 * Detect site type and framework using Railpack
 */
export async function detectSiteFramework(sitePath: string): Promise<{
  type: 'static' | 'static-build' | 'docker';
  framework?: string;
  buildCommand?: string;
  startCommand?: string;
  installCommand?: string;
}> {
  const plan = await getRailpackPlan(sitePath);
  
  if (!plan) {
    // Fallback to basic detection
    return detectSiteFrameworkFallback(sitePath);
  }
  
  // Extract commands from Railpack plan
  let installCommand: string | undefined;
  let buildCommand: string | undefined;
  let startCommand = plan.deploy?.startCommand;
  let framework: string | undefined;
  
  // Look through steps to find install and build commands
  if (plan.steps) {
    for (const step of plan.steps) {
      // Detect framework from step names (e.g., "packages:mise" suggests Node/Bun)
      if (step.name.includes('astro')) {
        framework = 'astro';
      } else if (step.name.includes('next')) {
        framework = 'nextjs';
      } else if (step.name.includes('vite')) {
        framework = 'vite';
      }
      
      // Find install command
      if (step.name === 'install' && step.commands) {
        for (const cmd of step.commands) {
          if (cmd.cmd && (cmd.cmd.includes('install') || cmd.cmd.includes('ci'))) {
            installCommand = cmd.cmd;
            break;
          }
        }
      }
      
      // Find build command
      if (step.name === 'build' && step.commands) {
        for (const cmd of step.commands) {
          if (cmd.cmd && (cmd.cmd.includes('build') || cmd.cmd.includes('compile'))) {
            buildCommand = cmd.cmd;
            break;
          }
        }
      }
    }
  }
  
  // Determine site type based on detected framework and commands
  // Following the new simplified types: static, static-build, docker
  let type: 'static' | 'static-build' | 'docker' = 'static';
  
  // Check if it's a pure static site (no build or start commands)
  const hasIndexHtml = existsSync(join(sitePath, 'index.html'));
  const hasPackageJson = existsSync(join(sitePath, 'package.json'));
  
  if (hasIndexHtml && !hasPackageJson && !buildCommand && !startCommand) {
    // Pure static site - just HTML/CSS/JS files
    type = 'static';
  } else if (buildCommand && startCommand?.includes('caddy')) {
    // Has build and serves with Caddy = static site generator (Astro, Eleventy, etc.)
    type = 'static-build';
  } else if (startCommand && !startCommand.includes('caddy')) {
    // Has non-Caddy start command = needs Docker for dynamic server
    type = 'docker';
  } else if (buildCommand && !startCommand) {
    // Has build but no start = static-build
    type = 'static-build';
  } else if (framework || hasPackageJson) {
    // Has framework or package.json = likely needs processing
    type = buildCommand ? 'static-build' : 'docker';
  }
  
  info(`Detected ${framework || 'unknown'} framework for ${sitePath}`);
  info(`Site type: ${type}, build: ${buildCommand || 'none'}, start: ${startCommand || 'none'}`);
  
  return {
    type,
    framework,
    buildCommand,
    startCommand,
    installCommand
  };
}

/**
 * Fallback site detection without Railpack
 */
function detectSiteFrameworkFallback(sitePath: string): {
  type: 'static' | 'static-build' | 'docker';
  framework?: string;
  buildCommand?: string;
  startCommand?: string;
  installCommand?: string;
} {
  // Check for common framework files
  const checks = [
    // Static site generators (build then serve dist)
    { file: 'astro.config.mjs', framework: 'astro', type: 'static-build' as const, build: 'npm run build' },
    { file: 'astro.config.js', framework: 'astro', type: 'static-build' as const, build: 'npm run build' },
    { file: 'gatsby-config.js', framework: 'gatsby', type: 'static-build' as const, build: 'npm run build' },
    { file: '_config.yml', framework: 'jekyll', type: 'static-build' as const, build: 'jekyll build' },
    { file: 'hugo.toml', framework: 'hugo', type: 'static-build' as const, build: 'hugo' },
    { file: '.eleventy.js', framework: 'eleventy', type: 'static-build' as const, build: 'npx @11ty/eleventy' },
    { file: 'vite.config.js', framework: 'vite', type: 'static-build' as const, build: 'npm run build' },
    { file: 'angular.json', framework: 'angular', type: 'static-build' as const, build: 'npm run build' },
    
    // Docker-based (needs a server)
    { file: 'next.config.js', framework: 'nextjs', type: 'docker' as const, start: 'npm run start' },
    { file: 'nuxt.config.js', framework: 'nuxt', type: 'docker' as const, start: 'npm run start' },
    { file: 'svelte.config.js', framework: 'sveltekit', type: 'docker' as const, start: 'npm run start' },
    { file: 'server.js', framework: 'node', type: 'docker' as const, start: 'node server.js' },
    { file: 'app.py', framework: 'python', type: 'docker' as const, start: 'python app.py' },
    { file: 'main.go', framework: 'go', type: 'docker' as const, start: 'go run main.go' },
    { file: 'Cargo.toml', framework: 'rust', type: 'docker' as const, start: 'cargo run' },
  ];
  
  for (const check of checks) {
    if (existsSync(join(sitePath, check.file))) {
      return {
        type: check.type,
        framework: check.framework,
        buildCommand: check.type === 'static-build' ? check.build : undefined,
        startCommand: check.type === 'docker' ? check.start : undefined,
        installCommand: existsSync(join(sitePath, 'package.json')) ? 'npm install' : undefined
      };
    }
  }
  
  // Check if it's a simple static site
  if (existsSync(join(sitePath, 'index.html'))) {
    return { type: 'static' };
  }
  
  // Check if it has package.json (could be any Node.js app)
  if (existsSync(join(sitePath, 'package.json'))) {
    try {
      const packageJson = require(join(sitePath, 'package.json'));
      const scripts = packageJson.scripts || {};
      
      if (scripts.build && !scripts.start) {
        // Build but no start = static-build
        return {
          type: 'static-build',
          framework: 'node',
          buildCommand: 'npm run build',
          installCommand: 'npm install'
        };
      } else if (scripts.start) {
        // Has start = needs Docker
        return {
          type: 'docker',
          framework: 'node',
          startCommand: 'npm run start',
          buildCommand: scripts.build ? 'npm run build' : undefined,
          installCommand: 'npm install'
        };
      }
    } catch (err) {
      debug(`Failed to read package.json in ${sitePath}: ${err}`);
    }
  }
  
  // Default to docker if we can't determine
  return { type: 'docker' };
}

/**
 * Build a Docker image for a site using Railpack
 */
export async function buildWithRailpack(
  sitePath: string,
  imageName: string,
  options: {
    env?: Record<string, string>;
    buildArgs?: string[];
  } = {}
): Promise<boolean> {
  if (!await isRailpackInstalled()) {
    error('Railpack CLI not installed - cannot build Docker image');
    return false;
  }
  
  // Ensure BuildKit is set up and get the container name
  const containerName = await ensureBuildKitSetup();
  if (!containerName) {
    error('Failed to set up BuildKit for Railpack');
    return false;
  }
  
  try {
    // Railpack build command: railpack build <directory> --name <imageName>
    const args = ['build', sitePath, '--name', imageName];
    
    // Add environment variables
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('--env', `${key}=${value}`);
      }
    }
    
    // Add additional build arguments
    if (options.buildArgs) {
      args.push(...options.buildArgs);
    }
    
    info(`Building Docker image with Railpack: ${imageName}`);
    debug(`Railpack command: railpack ${args.join(' ')}`);
    
    // Set BUILDKIT_HOST environment variable with actual container name
    const buildEnv = {
      ...process.env,
      BUILDKIT_HOST: `docker-container://${containerName}`
    };
    
    debug(`Using BUILDKIT_HOST: docker-container://${containerName}`);
    
    const result = await new Promise<boolean>((resolve) => {
      const proc = spawn('railpack', args, {
        shell: true,
        env: buildEnv,
        stdio: 'inherit' // Show build output
      });
      
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      
      proc.on('error', (err) => {
        error(`Railpack build error: ${err}`);
        resolve(false);
      });
    });
    
    if (result) {
      info(`Successfully built Docker image: ${imageName}`);
    } else {
      error(`Failed to build Docker image: ${imageName}`);
    }
    
    return result;
  } catch (err) {
    error(`Failed to build with Railpack: ${err}`);
    return false;
  }
}

/**
 * Generate a Dockerfile using Railpack (without building)
 */
export async function generateDockerfile(
  sitePath: string,
  outputPath: string
): Promise<boolean> {
  if (!await isRailpackInstalled()) {
    warn('Railpack CLI not installed');
    return false;
  }
  
  try {
    const args = ['generate', sitePath, '--out', outputPath];
    
    const result = await new Promise<boolean>((resolve) => {
      const proc = spawn('railpack', args, {
        shell: true,
        stdio: 'pipe'
      });
      
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      
      proc.on('error', () => {
        resolve(false);
      });
    });
    
    return result;
  } catch {
    return false;
  }
}