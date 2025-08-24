#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const packages = ['cli', 'core', 'server', 'actions'];

console.log('🔄 Restoring workspace dependencies...\n');

// Map of internal package names
const internalPackages = new Set([
  '@keithk/deploy-cli',
  '@keithk/deploy-core', 
  '@keithk/deploy-server',
  '@keithk/deploy-actions'
]);

// Restore workspace dependencies
for (const pkg of packages) {
  const packagePath = join(projectRoot, 'packages', pkg, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  
  let updated = false;
  
  if (packageJson.dependencies) {
    for (const [depName, depVersion] of Object.entries(packageJson.dependencies)) {
      if (internalPackages.has(depName) && depVersion.startsWith('^')) {
        packageJson.dependencies[depName] = 'workspace:*';
        console.log(`  ${pkg}: ${depName}@${depVersion} -> workspace:*`);
        updated = true;
      }
    }
  }
  
  if (updated) {
    writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(`✅ Restored ${pkg} package.json`);
  }
}

console.log('\n✅ Workspace dependencies restored!');