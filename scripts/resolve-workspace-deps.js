#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const packages = ['cli', 'core', 'server', 'actions'];

console.log('🔧 Resolving workspace dependencies...\n');

// Read all package versions
const packageVersions = {};
for (const pkg of packages) {
  const packagePath = join(projectRoot, 'packages', pkg, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  packageVersions[packageJson.name] = packageJson.version;
  console.log(`Found ${packageJson.name}@${packageJson.version}`);
}

console.log('\n📝 Updating workspace dependencies...\n');

// Update workspace dependencies with actual versions
for (const pkg of packages) {
  const packagePath = join(projectRoot, 'packages', pkg, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  
  let updated = false;
  
  if (packageJson.dependencies) {
    for (const [depName, depVersion] of Object.entries(packageJson.dependencies)) {
      if (depVersion === 'workspace:*' && packageVersions[depName]) {
        packageJson.dependencies[depName] = `^${packageVersions[depName]}`;
        console.log(`  ${pkg}: ${depName}@workspace:* -> ^${packageVersions[depName]}`);
        updated = true;
      }
    }
  }
  
  if (updated) {
    writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(`✅ Updated ${pkg} package.json`);
  }
}

console.log('\n✅ Workspace dependencies resolved!');