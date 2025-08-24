#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const packages = ['cli', 'core', 'server', 'actions'];
const errors = [];

console.log('🔍 Validating packages before publish...\n');

for (const pkg of packages) {
  const packagePath = join(projectRoot, 'packages', pkg, 'package.json');
  const distPath = join(projectRoot, 'packages', pkg, 'dist');
  
  console.log(`Validating @keithk/deploy-${pkg}...`);
  
  if (!existsSync(packagePath)) {
    errors.push(`❌ Package.json not found: ${packagePath}`);
    continue;
  }
  
  if (!existsSync(distPath)) {
    errors.push(`❌ Dist directory not found: ${distPath}`);
    continue;
  }
  
  try {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    
    // Check for workspace dependencies
    if (packageJson.dependencies) {
      for (const [depName, depVersion] of Object.entries(packageJson.dependencies)) {
        if (depVersion === 'workspace:*') {
          errors.push(`❌ ${pkg}: Found workspace dependency ${depName}@${depVersion}`);
        }
      }
    }
    
    // Check if main file exists
    if (packageJson.main) {
      const mainPath = join(projectRoot, 'packages', pkg, packageJson.main);
      if (!existsSync(mainPath)) {
        errors.push(`❌ ${pkg}: Main file not found: ${packageJson.main}`);
      }
    }
    
    // Check files array
    if (packageJson.files) {
      for (const file of packageJson.files) {
        const filePath = join(projectRoot, 'packages', pkg, file);
        if (!existsSync(filePath)) {
          errors.push(`❌ ${pkg}: File listed in files array not found: ${file}`);
        }
      }
    }
    
    console.log(`  ✅ Package structure valid`);
    
  } catch (err) {
    errors.push(`❌ ${pkg}: Failed to parse package.json: ${err.message}`);
  }
}

console.log('\n📊 Validation Results:');

if (errors.length === 0) {
  console.log('✅ All packages are valid and ready for publishing!');
  process.exit(0);
} else {
  console.log(`❌ Found ${errors.length} validation errors:\n`);
  errors.forEach(error => console.log(error));
  console.log('\n🔧 Fix these errors before publishing.');
  process.exit(1);
}