import { existsSync, mkdirSync, renameSync, rmSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import type { Codemod, CodemodResult, FileChange } from "./types";
import { info, warn, error as logError } from "../../core";

/**
 * Migrates configuration from old structure to new structure:
 * - .dialup/config.json -> deploy.json (root)
 * - config.json -> deploy.json (root fallback)
 * - sites/[name]/config.json -> sites/[name]/.deploy/config.json
 * - sites/[name]/.dialup/config.json -> sites/[name]/.deploy/config.json
 * - sites/[name]/.dialup/actions -> sites/[name]/.deploy/actions
 * - .dialup/actions -> .deploy/actions (root)
 */
export const configMigrationCodemod: Codemod = {
  name: "config-migration",
  description: "Migrate configuration files from .dialup to standardized structure",
  version: "1.0.0",
  
  async run(rootDir: string, options) {
    const changes: FileChange[] = [];
    const errors: string[] = [];
    
    try {
      // 1. Migrate root configuration
      const rootDialupConfig = join(rootDir, ".dialup", "config.json");
      const rootOldConfig = join(rootDir, "config.json");
      const rootNewConfig = join(rootDir, "deploy.json");
      
      if (existsSync(rootDialupConfig)) {
        if (existsSync(rootNewConfig) && !options.force) {
          errors.push(`deploy.json already exists. Use --force to overwrite.`);
        } else {
          if (!options.dryRun) {
            const content = await Bun.file(rootDialupConfig).text();
            await Bun.write(rootNewConfig, content);
            rmSync(rootDialupConfig);
          }
          changes.push({
            type: 'move',
            from: rootDialupConfig,
            to: rootNewConfig,
            description: 'Migrate root .dialup/config.json to deploy.json'
          });
        }
      } else if (existsSync(rootOldConfig)) {
        if (existsSync(rootNewConfig) && !options.force) {
          errors.push(`deploy.json already exists. Use --force to overwrite.`);
        } else {
          if (!options.dryRun) {
            renameSync(rootOldConfig, rootNewConfig);
          }
          changes.push({
            type: 'move',
            from: rootOldConfig,
            to: rootNewConfig,
            description: 'Migrate root config.json to deploy.json'
          });
        }
      }
      
      // 2. Migrate root actions directory
      const rootDialupActions = join(rootDir, ".dialup", "actions");
      const rootDeployActions = join(rootDir, ".deploy", "actions");
      
      if (existsSync(rootDialupActions)) {
        if (existsSync(rootDeployActions) && !options.force) {
          errors.push(`.deploy/actions already exists. Use --force to overwrite.`);
        } else {
          if (!options.dryRun) {
            mkdirSync(dirname(rootDeployActions), { recursive: true });
            renameSync(rootDialupActions, rootDeployActions);
          }
          changes.push({
            type: 'move',
            from: rootDialupActions,
            to: rootDeployActions,
            description: 'Migrate root .dialup/actions to .deploy/actions'
          });
        }
      }
      
      // 3. Clean up empty .dialup directory
      const rootDialupDir = join(rootDir, ".dialup");
      if (existsSync(rootDialupDir)) {
        try {
          const contents = readdirSync(rootDialupDir);
          if (contents.length === 0) {
            if (!options.dryRun) {
              rmSync(rootDialupDir, { recursive: true });
            }
            changes.push({
              type: 'delete',
              from: rootDialupDir,
              description: 'Remove empty .dialup directory'
            });
          }
        } catch (e) {
          // Ignore errors when removing directory
        }
      }
      
      // 4. Migrate site configurations
      const sitesDir = join(rootDir, "sites");
      if (existsSync(sitesDir)) {
        const sites = readdirSync(sitesDir);
        
        for (const site of sites) {
          const siteDir = join(sitesDir, site);
          
          // Skip if not a directory
          if (!statSync(siteDir).isDirectory()) continue;
          
          // Migrate site config
          const siteDialupConfig = join(siteDir, ".dialup", "config.json");
          const siteOldConfig = join(siteDir, "config.json");
          const siteDeployDir = join(siteDir, ".deploy");
          const siteNewConfig = join(siteDeployDir, "config.json");
          
          if (existsSync(siteDialupConfig)) {
            if (!options.dryRun) {
              mkdirSync(siteDeployDir, { recursive: true });
              const content = await Bun.file(siteDialupConfig).text();
              await Bun.write(siteNewConfig, content);
              rmSync(siteDialupConfig);
            }
            changes.push({
              type: 'move',
              from: siteDialupConfig,
              to: siteNewConfig,
              description: `Migrate ${site}/.dialup/config.json to ${site}/.deploy/config.json`
            });
          } else if (existsSync(siteOldConfig)) {
            if (!options.dryRun) {
              mkdirSync(siteDeployDir, { recursive: true });
              const content = await Bun.file(siteOldConfig).text();
              await Bun.write(siteNewConfig, content);
              rmSync(siteOldConfig);
            }
            changes.push({
              type: 'move',
              from: siteOldConfig,
              to: siteNewConfig,
              description: `Migrate ${site}/config.json to ${site}/.deploy/config.json`
            });
          }
          
          // Migrate site actions
          const siteDialupActions = join(siteDir, ".dialup", "actions");
          const siteDeployActions = join(siteDir, ".deploy", "actions");
          
          if (existsSync(siteDialupActions)) {
            if (!options.dryRun) {
              mkdirSync(dirname(siteDeployActions), { recursive: true });
              renameSync(siteDialupActions, siteDeployActions);
            }
            changes.push({
              type: 'move',
              from: siteDialupActions,
              to: siteDeployActions,
              description: `Migrate ${site}/.dialup/actions to ${site}/.deploy/actions`
            });
          }
          
          // Clean up empty .dialup directory
          const siteDialupDir = join(siteDir, ".dialup");
          if (existsSync(siteDialupDir)) {
            try {
              const contents = readdirSync(siteDialupDir);
              if (contents.length === 0) {
                if (!options.dryRun) {
                  rmSync(siteDialupDir, { recursive: true });
                }
                changes.push({
                  type: 'delete',
                  from: siteDialupDir,
                  description: `Remove empty ${site}/.dialup directory`
                });
              }
            } catch (e) {
              // Ignore errors when removing directory
            }
          }
        }
      }
      
      return {
        success: errors.length === 0,
        changes,
        errors
      };
      
    } catch (e) {
      return {
        success: false,
        changes,
        errors: [`Migration failed: ${e instanceof Error ? e.message : String(e)}`]
      };
    }
  }
};