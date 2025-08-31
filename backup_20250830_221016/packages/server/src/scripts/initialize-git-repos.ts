#!/usr/bin/env bun
import { gitService } from '../services/git-service';
import { siteRepositoryManager } from '../services/site-repository-manager';
import { migrationManager } from '@keithk/deploy-core/src/database/migrations';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { info, error, warn } from '../utils/logging';

/**
 * Script to initialize Git repositories for all existing sites
 */
async function initializeAllSiteRepos() {
  const sitesDir = process.env.ROOT_DIR ? join(process.env.ROOT_DIR, 'sites') : join(process.cwd(), '../../sites');
  
  info(`Initializing Git repositories for sites in: ${sitesDir}`);
  
  // First, ensure database migrations are up to date
  info(`Running database migrations...`);
  try {
    migrationManager.runMigrations();
    info(`✅ Database migrations completed`);
  } catch (err) {
    error(`Failed to run database migrations: ${err}`);
    process.exit(1);
  }
  
  if (!existsSync(sitesDir)) {
    error(`Sites directory does not exist: ${sitesDir}`);
    process.exit(1);
  }

  try {
    // Get all site directories (exclude logs and other non-site folders)
    const entries = readdirSync(sitesDir, { withFileTypes: true });
    const siteDirs = entries
      .filter(entry => entry.isDirectory())
      .filter(entry => !['logs', '.git', '.deploy', 'admin', 'editor'].includes(entry.name))
      .map(entry => ({
        name: entry.name,
        path: join(sitesDir, entry.name)
      }));

    info(`Found ${siteDirs.length} site directories to process`);

    let initialized = 0;
    let skipped = 0;
    let failed = 0;

    for (const site of siteDirs) {
      try {
        info(`Processing site: ${site.name}`);
        
        // Check if already has Git repository
        if (gitService.isGitRepository(site.path)) {
          info(`  ✓ Site ${site.name} already has Git repository`);
          
          // Update repository metadata in database
          await siteRepositoryManager.initializeSiteRepository(site.name, site.path);
          skipped++;
        } else {
          info(`  📦 Initializing Git repository for ${site.name}`);
          
          // Initialize Git repository
          await gitService.initializeRepository(site.path);
          
          // Add to repository management system
          await siteRepositoryManager.initializeSiteRepository(site.name, site.path);
          
          info(`  ✅ Successfully initialized Git repository for ${site.name}`);
          initialized++;
        }
      } catch (err) {
        error(`  ❌ Failed to initialize repository for site ${site.name}: ${err}`);
        failed++;
      }
    }

    info(`\n📊 Git repository initialization complete:`);
    info(`   - Initialized: ${initialized} sites`);
    info(`   - Already existed: ${skipped} sites`);
    info(`   - Failed: ${failed} sites`);
    info(`   - Total processed: ${siteDirs.length} sites`);

    if (failed > 0) {
      warn(`Some sites failed to initialize. Check logs above for details.`);
      process.exit(1);
    }

    info(`🎉 All sites now have Git repositories!`);
  } catch (err) {
    error(`Failed to initialize Git repositories: ${err}`);
    process.exit(1);
  }
}

// Run the script if called directly
if (import.meta.main) {
  initializeAllSiteRepos().catch(err => {
    error(`Script failed: ${err}`);
    process.exit(1);
  });
}

export { initializeAllSiteRepos };