import { Hono } from 'hono';
import { join, resolve } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Database } from '@core/database/database';
import { requireAuth } from './auth';
import type { AuthenticatedContext, AuthenticatedUser } from '@core/types';
import { detectPackageManager } from '@core/utils/packageManager';
import { spawn } from 'child_process';
import { promisify } from 'util';

const packagesRoutes = new Hono<AuthenticatedContext>();

// Apply authentication to all package routes
packagesRoutes.use('*', requireAuth);

interface MiseConfig {
  tools?: Record<string, string>;
  tasks?: Record<string, {
    run: string;
    description?: string;
    env?: Record<string, string>;
  }>;
  env?: Record<string, string>;
}

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface RuntimeInfo {
  name: string;
  current?: string;
  available?: string[];
  status: 'installed' | 'missing' | 'outdated';
}

/**
 * Check if user has access to a site
 */
async function checkSiteAccess(siteName: string, userId: number, isAdmin: boolean): Promise<{ hasAccess: boolean; sitePath?: string }> {
  const db = Database.getInstance();
  
  const sites = db.query<{ user_id: number; path: string }>(
    `SELECT user_id, path FROM sites WHERE name = ?`,
    [siteName]
  );
  
  if (sites.length === 0) {
    return { hasAccess: false };
  }
  
  const site = sites[0];
  
  if (!site) {
    return { hasAccess: false };
  }
  
  if (site.user_id !== userId && !isAdmin) {
    return { hasAccess: false };
  }
  
  const sitePath = site.path.startsWith('/')
    ? site.path
    : resolve(process.env.ROOT_DIR || './sites', siteName);
    
  return { hasAccess: true, sitePath };
}

/**
 * Execute command and return result
 */
async function execCommand(command: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode || 0 });
    });

    // Timeout after 2 minutes for safety
    setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ stdout, stderr: stderr + '\nCommand timed out after 2 minutes', exitCode: 1 });
    }, 120000);
  });
}

/**
 * Parse mise TOML config
 */
function parseMiseToml(content: string): MiseConfig {
  const config: MiseConfig = {
    tools: {},
    tasks: {},
    env: {}
  };

  try {
    const lines = content.split('\n');
    let currentSection = '';
    let currentTaskName = '';

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }

      // Section headers
      if (trimmed.startsWith('[')) {
        if (trimmed === '[tools]') {
          currentSection = 'tools';
        } else if (trimmed === '[env]') {
          currentSection = 'env';
        } else if (trimmed.startsWith('[tasks.')) {
          currentSection = 'tasks';
          currentTaskName = trimmed.slice(7, -1); // Extract task name from [tasks.taskname]
          config.tasks![currentTaskName] = { run: '' };
        }
        continue;
      }

      // Key-value pairs
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmed.slice(0, equalIndex).trim();
        const value = trimmed.slice(equalIndex + 1).trim().replace(/^["']|["']$/g, '');

        if (currentSection === 'tools') {
          config.tools![key] = value;
        } else if (currentSection === 'env') {
          config.env![key] = value;
        } else if (currentSection === 'tasks' && currentTaskName) {
          if (key === 'run') {
            config.tasks![currentTaskName]!.run = value;
          } else if (key === 'description') {
            config.tasks![currentTaskName]!.description = value;
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to parse mise TOML:', err);
  }

  return config;
}

/**
 * Convert mise config to TOML
 */
function configToToml(config: MiseConfig): string {
  let toml = '# Mise configuration\n';
  
  if (config.tools && Object.keys(config.tools).length > 0) {
    toml += '\n[tools]\n';
    Object.entries(config.tools).forEach(([tool, version]) => {
      toml += `${tool} = "${version}"\n`;
    });
  }
  
  if (config.tasks && Object.keys(config.tasks).length > 0) {
    Object.entries(config.tasks).forEach(([taskName, task]) => {
      toml += `\n[tasks.${taskName}]\n`;
      toml += `run = "${task.run}"\n`;
      if (task.description) {
        toml += `description = "${task.description}"\n`;
      }
      if (task.env && Object.keys(task.env).length > 0) {
        toml += 'env = { ';
        const envEntries = Object.entries(task.env).map(([key, value]) => `${key} = "${value}"`);
        toml += envEntries.join(', ');
        toml += ' }\n';
      }
    });
  }
  
  if (config.env && Object.keys(config.env).length > 0) {
    toml += '\n[env]\n';
    Object.entries(config.env).forEach(([key, value]) => {
      toml += `${key} = "${value}"\n`;
    });
  }
  
  return toml;
}

// Get package manager overview for a site
packagesRoutes.get('/sites/:sitename/packages', async (c) => {
  const user = c.get('user') as AuthenticatedUser;
  const siteName = c.req.param('sitename');
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    if (!existsSync(sitePath)) {
      return c.json({ success: false, error: 'Site directory not found' });
    }
    
    // Read package.json if it exists
    let packageJson: PackageJson = {};
    const packageJsonPath = join(sitePath, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      } catch (err) {
        console.error('Failed to parse package.json:', err);
      }
    }
    
    // Read mise config if it exists
    let miseConfig: MiseConfig = {};
    const miseConfigPath = join(sitePath, '.mise.toml');
    if (existsSync(miseConfigPath)) {
      try {
        const miseContent = readFileSync(miseConfigPath, 'utf8');
        miseConfig = parseMiseToml(miseContent);
      } catch (err) {
        console.error('Failed to parse .mise.toml:', err);
      }
    }
    
    // Detect current package manager
    const detectedPackageManager = detectPackageManager(sitePath);
    
    // Get runtime information
    const runtimes: RuntimeInfo[] = [];
    
    if (miseConfig.tools) {
      for (const [tool, version] of Object.entries(miseConfig.tools)) {
        runtimes.push({
          name: tool,
          current: version,
          status: 'installed'
        });
      }
    }
    
    return c.json({
      success: true,
      data: {
        siteName,
        packageManager: detectedPackageManager,
        hasMise: existsSync(miseConfigPath),
        hasPackageJson: existsSync(packageJsonPath),
        packageJson,
        miseConfig,
        runtimes,
        scripts: packageJson.scripts || {},
        dependencies: {
          production: packageJson.dependencies || {},
          development: packageJson.devDependencies || {}
        }
      }
    });
    
  } catch (error) {
    console.error('Error loading packages overview:', error);
    return c.json({ success: false, error: 'Failed to load packages overview' });
  }
});

// Get available runtime versions
packagesRoutes.get('/sites/:sitename/packages/runtimes/:runtime/versions', async (c) => {
  const user = c.get('user') as AuthenticatedUser;
  const siteName = c.req.param('sitename');
  const runtime = c.req.param('runtime');
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    // Use mise to list available versions
    const result = await execCommand('mise', ['ls-remote', runtime], sitePath);
    
    if (result.exitCode !== 0) {
      return c.json({ success: false, error: `Failed to fetch versions: ${result.stderr}` });
    }
    
    // Parse mise output to get versions
    const versions = result.stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .slice(0, 20); // Limit to 20 most recent versions
    
    return c.json({
      success: true,
      data: {
        runtime,
        versions
      }
    });
    
  } catch (error) {
    console.error('Error fetching runtime versions:', error);
    return c.json({ success: false, error: 'Failed to fetch runtime versions' });
  }
});

// Install or update a runtime version
packagesRoutes.post('/sites/:sitename/packages/runtimes/:runtime', async (c) => {
  const user = c.get('user') as AuthenticatedUser;
  const siteName = c.req.param('sitename');
  const runtime = c.req.param('runtime');
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    const { version } = await c.req.json();
    
    if (!version) {
      return c.json({ success: false, error: 'Version is required' });
    }
    
    // Install the runtime version
    const result = await execCommand('mise', ['use', `${runtime}@${version}`], sitePath);
    
    if (result.exitCode !== 0) {
      return c.json({ success: false, error: `Failed to install ${runtime}@${version}: ${result.stderr}` });
    }
    
    return c.json({
      success: true,
      message: `Successfully installed ${runtime}@${version}`,
      output: result.stdout
    });
    
  } catch (error) {
    console.error('Error installing runtime:', error);
    return c.json({ success: false, error: 'Failed to install runtime' });
  }
});

// Run a package script
packagesRoutes.post('/sites/:sitename/packages/scripts/:scriptName/run', async (c) => {
  const user = c.get('user') as AuthenticatedUser;
  const siteName = c.req.param('sitename');
  const scriptName = c.req.param('scriptName');
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    const { args = [] } = await c.req.json();
    
    // Check if using mise or traditional package manager
    const miseConfigPath = join(sitePath, '.mise.toml');
    const hasMise = existsSync(miseConfigPath);
    
    let result;
    if (hasMise) {
      // Use mise to run the task
      result = await execCommand('mise', ['run', scriptName, ...args], sitePath);
    } else {
      // Use traditional package manager
      const packageManager = detectPackageManager(sitePath);
      
      let command, commandArgs;
      switch (packageManager) {
        case 'yarn':
          command = 'yarn';
          commandArgs = [scriptName, ...args];
          break;
        case 'pnpm':
          command = 'pnpm';
          commandArgs = ['run', scriptName, '--', ...args];
          break;
        case 'bun':
          command = 'bun';
          commandArgs = ['run', scriptName, ...args];
          break;
        default:
          command = 'npm';
          commandArgs = ['run', scriptName, '--', ...args];
      }
      
      result = await execCommand(command, commandArgs, sitePath);
    }
    
    return c.json({
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      message: result.exitCode === 0 
        ? `Successfully executed ${scriptName}` 
        : `Script ${scriptName} failed with exit code ${result.exitCode}`
    });
    
  } catch (error) {
    console.error('Error running script:', error);
    return c.json({ success: false, error: 'Failed to run script' });
  }
});

// Install dependencies
packagesRoutes.post('/sites/:sitename/packages/dependencies/install', async (c) => {
  const user = c.get('user') as AuthenticatedUser;
  const siteName = c.req.param('sitename');
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    // Check if using mise or traditional package manager
    const miseConfigPath = join(sitePath, '.mise.toml');
    const hasMise = existsSync(miseConfigPath);
    
    let result;
    if (hasMise) {
      // Use mise to run install task if defined
      result = await execCommand('mise', ['run', 'install'], sitePath);
      
      // If no install task defined, fall back to package manager
      if (result.exitCode !== 0) {
        const packageManager = detectPackageManager(sitePath);
        result = await execCommand(packageManager, ['install'], sitePath);
      }
    } else {
      // Use traditional package manager
      const packageManager = detectPackageManager(sitePath);
      result = await execCommand(packageManager, ['install'], sitePath);
    }
    
    return c.json({
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      message: result.exitCode === 0 
        ? 'Dependencies installed successfully' 
        : `Installation failed with exit code ${result.exitCode}`
    });
    
  } catch (error) {
    console.error('Error installing dependencies:', error);
    return c.json({ success: false, error: 'Failed to install dependencies' });
  }
});

// Add a new dependency
packagesRoutes.post('/sites/:sitename/packages/dependencies', async (c) => {
  const user = c.get('user') as AuthenticatedUser;
  const siteName = c.req.param('sitename');
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    const { packageName, version = 'latest', isDev = false } = await c.req.json();
    
    if (!packageName) {
      return c.json({ success: false, error: 'Package name is required' });
    }
    
    const packageManager = detectPackageManager(sitePath);
    let command, args;
    
    const packageSpec = version === 'latest' ? packageName : `${packageName}@${version}`;
    
    switch (packageManager) {
      case 'yarn':
        command = 'yarn';
        args = ['add', packageSpec];
        if (isDev) args.push('--dev');
        break;
      case 'pnpm':
        command = 'pnpm';
        args = ['add', packageSpec];
        if (isDev) args.push('--save-dev');
        break;
      case 'bun':
        command = 'bun';
        args = ['add', packageSpec];
        if (isDev) args.push('--dev');
        break;
      default:
        command = 'npm';
        args = ['install', packageSpec];
        if (isDev) args.push('--save-dev');
    }
    
    const result = await execCommand(command, args, sitePath);
    
    return c.json({
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      message: result.exitCode === 0 
        ? `Successfully added ${packageSpec}` 
        : `Failed to add ${packageSpec}`
    });
    
  } catch (error) {
    console.error('Error adding dependency:', error);
    return c.json({ success: false, error: 'Failed to add dependency' });
  }
});

// Update .mise.toml configuration
packagesRoutes.put('/sites/:sitename/packages/mise-config', async (c) => {
  const user = c.get('user') as AuthenticatedUser;
  const siteName = c.req.param('sitename');
  
  try {
    const { hasAccess, sitePath } = await checkSiteAccess(siteName, user.id, user.is_admin);
    
    if (!hasAccess || !sitePath) {
      return c.json({ success: false, error: 'Access denied' });
    }
    
    const { config } = await c.req.json();
    
    if (!config) {
      return c.json({ success: false, error: 'Config is required' });
    }
    
    const miseConfigPath = join(sitePath, '.mise.toml');
    const tomlContent = configToToml(config);
    
    writeFileSync(miseConfigPath, tomlContent, 'utf8');
    
    return c.json({
      success: true,
      message: '.mise.toml updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating mise config:', error);
    return c.json({ success: false, error: 'Failed to update mise config' });
  }
});

export { packagesRoutes };