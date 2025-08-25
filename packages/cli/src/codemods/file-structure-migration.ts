import { existsSync, statSync } from "fs";
import { join, dirname } from "path";
import type { Codemod, CodemodResult, CodemodOptions } from "./types";
import { 
  DEPLOY_PATHS, 
  LEGACY_PATHS, 
  initializeDeployStructure 
} from "@keithk/deploy-core/src/config/paths";

export const fileStructureMigrationCodemod: Codemod = {
  name: "file-structure-migration",
  description: "Migrate generated files to the new .deploy/ directory structure",
  version: "1.0.0",
  
  async run(rootDir: string, options: CodemodOptions): Promise<CodemodResult> {
    const result: CodemodResult = {
      success: true,
      changes: [],
      errors: []
    };

    try {
      // Define the migrations to perform
      const migrations = [
        {
          name: "Database file",
          oldPath: LEGACY_PATHS.oldDatabase,
          newPath: DEPLOY_PATHS.database,
          isDirectory: false
        },
        {
          name: "Development Caddyfile",
          oldPath: LEGACY_PATHS.oldCaddyfile,
          newPath: DEPLOY_PATHS.caddyfile,
          isDirectory: false
        },
        {
          name: "Production Caddyfile",
          oldPath: LEGACY_PATHS.oldCaddyfileProduction,
          newPath: DEPLOY_PATHS.caddyfileProduction,
          isDirectory: false
        },
        {
          name: "Caddy data directory",
          oldPath: LEGACY_PATHS.oldCaddyData,
          newPath: DEPLOY_PATHS.caddyData,
          isDirectory: true
        },
        {
          name: "SSL certificates directory",
          oldPath: LEGACY_PATHS.oldSslDir,
          newPath: DEPLOY_PATHS.sslDev,
          isDirectory: true
        },
        {
          name: "Build cache file",
          oldPath: LEGACY_PATHS.oldBuildCache,
          newPath: DEPLOY_PATHS.buildCache,
          isDirectory: false
        },
        {
          name: "Root configuration file",
          oldPath: LEGACY_PATHS.oldRootConfig,
          newPath: DEPLOY_PATHS.rootConfig,
          isDirectory: false
        }
      ];

      // Initialize the .deploy directory structure
      if (!existsSync(DEPLOY_PATHS.deployDir)) {
        result.changes.push({
          type: 'create',
          to: DEPLOY_PATHS.deployDir,
          description: "Create .deploy/ directory structure"
        });

        if (!options.dryRun) {
          await initializeDeployStructure();
        }
      }

      // Process each migration
      for (const migration of migrations) {
        const { name, oldPath, newPath, isDirectory } = migration;

        // Skip if old path doesn't exist
        if (!existsSync(oldPath)) {
          continue;
        }

        // Check if target already exists
        if (existsSync(newPath) && !options.force) {
          result.errors.push(`${name} target already exists at ${newPath}. Use --force to overwrite.`);
          continue;
        }

        // Add to changes
        result.changes.push({
          type: 'move',
          from: oldPath,
          to: newPath,
          description: `Move ${name} to new location`
        });

        // Perform the migration if not dry run
        if (!options.dryRun) {
          try {
            // Ensure parent directory exists
            const parentDir = dirname(newPath);
            if (!existsSync(parentDir)) {
              await Bun.write(join(parentDir, '.gitkeep'), '');
            }

            // Move the file or directory
            const proc = Bun.spawn(['mv', oldPath, newPath], {
              stdio: ['ignore', 'ignore', 'pipe']
            });
            const exitCode = await proc.exited;
            
            if (exitCode !== 0) {
              const stderr = await new Response(proc.stderr).text();
              result.errors.push(`Failed to move ${name}: ${stderr}`);
              result.success = false;
            }
          } catch (error) {
            result.errors.push(`Failed to move ${name}: ${error instanceof Error ? error.message : String(error)}`);
            result.success = false;
          }
        }
      }

      // Clean up empty legacy directories
      const legacyDirs = [
        join(rootDir, "data"),
        join(rootDir, "config"),
        join(rootDir, ".build-cache")
      ];

      for (const dir of legacyDirs) {
        if (existsSync(dir)) {
          try {
            const stats = statSync(dir);
            if (stats.isDirectory()) {
              // Check if directory is empty
              const proc = Bun.spawn(['find', dir, '-mindepth', '1', '-print', '-quit'], {
                stdio: ['ignore', 'pipe', 'ignore']
              });
              const output = await new Response(proc.stdout).text();
              const exitCode = await proc.exited;
              
              if (exitCode === 0 && output.trim() === '') {
                // Directory is empty, can be removed
                result.changes.push({
                  type: 'delete',
                  from: dir,
                  description: `Remove empty legacy directory ${dir}`
                });

                if (!options.dryRun) {
                  const rmProc = Bun.spawn(['rmdir', dir], {
                    stdio: ['ignore', 'ignore', 'ignore']
                  });
                  await rmProc.exited;
                }
              }
            }
          } catch (error) {
            // Ignore errors when checking/removing directories
          }
        }
      }

      // Create .gitignore entry recommendation
      const gitignorePath = join(rootDir, '.gitignore');
      if (existsSync(gitignorePath)) {
        const content = await Bun.file(gitignorePath).text();
        
        if (!content.includes('.deploy/')) {
          result.changes.push({
            type: 'update',
            to: gitignorePath,
            description: "Add .deploy/ to .gitignore (recommended - please do this manually)"
          });
          
          // Note: We don't automatically update .gitignore to avoid conflicts
          // Users should do this manually
        }
      } else {
        result.changes.push({
          type: 'create',
          to: gitignorePath,
          description: "Create .gitignore with .deploy/ entry (recommended - please do this manually)"
        });
      }

    } catch (error) {
      result.success = false;
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }
};