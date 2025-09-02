/**
 * Generate a .mise.toml configuration file based on Railpack analysis
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import type { RailpackPlan } from '../../utils/railpack';
import { debug, info } from '../../utils/logging';

interface MiseConfig {
  tools: Record<string, string>;
  tasks: Record<string, any>;
  env?: Record<string, string>;
}

/**
 * Generate mise configuration from Railpack plan
 */
export function generateMiseConfig(plan: RailpackPlan | null, sitePath: string): MiseConfig {
  const config: MiseConfig = {
    tools: {},
    tasks: {},
  };

  if (plan?.steps) {
    // Extract tool versions from Railpack plan
    for (const step of plan.steps) {
      if (step.name === 'packages:mise' || step.name === 'install') {
        // Look for Node.js version
        if (step.inputs) {
          for (const input of step.inputs) {
            if (input.image?.includes('node:')) {
              const nodeVersion = input.image.split(':')[1]?.split('-')[0];
              if (nodeVersion) {
                config.tools.node = nodeVersion;
              }
            }
          }
        }
        
        // Look for package manager in commands
        if (step.commands) {
          for (const cmd of step.commands) {
            if (cmd.cmd?.includes('bun install')) {
              config.tools.bun = 'latest';
            } else if (cmd.cmd?.includes('pnpm install')) {
              config.tools.pnpm = 'latest';
            } else if (cmd.cmd?.includes('yarn install')) {
              config.tools.yarn = 'latest';
            }
          }
        }
      }
    }
  }

  // Default to Node 20 if not detected
  if (!config.tools.node) {
    config.tools.node = '20';
  }

  // Detect package manager from lock files if not already set
  const fs = require('fs');
  if (fs.existsSync(join(sitePath, 'bun.lockb'))) {
    config.tools.bun = config.tools.bun || 'latest';
  } else if (fs.existsSync(join(sitePath, 'pnpm-lock.yaml'))) {
    config.tools.pnpm = config.tools.pnpm || 'latest';
  } else if (fs.existsSync(join(sitePath, 'yarn.lock'))) {
    config.tools.yarn = config.tools.yarn || 'latest';
  }

  // Add dev task based on package.json
  try {
    const packageJsonPath = join(sitePath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Determine which package manager to use for the task
      let runCommand = 'npm';
      if (config.tools.bun) {
        runCommand = 'bun';
      } else if (config.tools.pnpm) {
        runCommand = 'pnpm';
      } else if (config.tools.yarn) {
        runCommand = 'yarn';
      }

      // Add tasks from package.json scripts
      if (packageJson.scripts) {
        // Add dev task with port configuration
        if (packageJson.scripts.dev) {
          // Add port flag based on the framework/tool
          let devCommand = `${runCommand} run dev`;
          
          // Detect framework and add appropriate port flag
          if (packageJson.scripts.dev.includes('astro')) {
            devCommand += ' --port $PORT --host 0.0.0.0';
          } else if (packageJson.scripts.dev.includes('vite') || packageJson.scripts.dev.includes('nuxt')) {
            devCommand += ' --port $PORT --host 0.0.0.0';
          } else if (packageJson.scripts.dev.includes('next')) {
            devCommand += ' -p $PORT -H 0.0.0.0';
          }
          
          config.tasks.dev = {
            run: devCommand,
            description: 'Run development server'
          };
        }
        
        // Add build task
        if (packageJson.scripts.build) {
          config.tasks.build = {
            run: `${runCommand} run build`,
            description: 'Build the project'
          };
        }

        // Add install task
        config.tasks.install = {
          run: `${runCommand} install`,
          description: 'Install dependencies'
        };
      }
    }
  } catch (err) {
    debug(`Could not read package.json: ${err}`);
  }

  // Fallback dev task if none exists
  if (!config.tasks.dev) {
    config.tasks.dev = {
      run: 'npm run dev',
      description: 'Run development server (fallback)'
    };
  }

  return config;
}

/**
 * Write mise configuration to file
 */
export function writeMiseConfig(sitePath: string, config: MiseConfig): void {
  const tomlContent = generateToml(config);
  const configPath = join(sitePath, '.mise.toml');
  
  writeFileSync(configPath, tomlContent, 'utf8');
  info(`Generated .mise.toml for ${sitePath}`);
  debug(`Mise config: ${tomlContent}`);
}

/**
 * Generate TOML content from config object
 */
function generateToml(config: MiseConfig): string {
  let toml = '';
  
  // Add tools section
  if (Object.keys(config.tools).length > 0) {
    toml += '[tools]\n';
    for (const [tool, version] of Object.entries(config.tools)) {
      toml += `${tool} = "${version}"\n`;
    }
    toml += '\n';
  }
  
  // Add tasks section
  if (Object.keys(config.tasks).length > 0) {
    for (const [taskName, task] of Object.entries(config.tasks)) {
      toml += `[tasks.${taskName}]\n`;
      if (typeof task === 'string') {
        toml += `run = "${task}"\n`;
      } else {
        if (task.run) toml += `run = "${task.run}"\n`;
        if (task.description) toml += `description = "${task.description}"\n`;
      }
      toml += '\n';
    }
  }
  
  // Add env section if present
  if (config.env && Object.keys(config.env).length > 0) {
    toml += '[env]\n';
    for (const [key, value] of Object.entries(config.env)) {
      toml += `${key} = "${value}"\n`;
    }
  }
  
  return toml;
}