#!/usr/bin/env node

/**
 * Script to merge package.json files from multiple packages into root
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Package directories to merge
const PACKAGES = ['cli', 'server', 'core', 'actions'];

// Dependencies to exclude (workspace references)
const EXCLUDE_DEPS = [
  '@keithk/deploy-core',
  '@keithk/deploy-server',
  '@keithk/deploy-actions',
  '@keithk/deploy-cli'
];

// Load a package.json file
const loadPackageJson = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`⚠️  Could not load ${filePath}: ${error.message}`);
    return null;
  }
};

// Merge dependencies, excluding workspace references
const mergeDependencies = (target = {}, source = {}) => {
  const merged = { ...target };
  
  for (const [name, version] of Object.entries(source)) {
    // Skip workspace dependencies
    if (EXCLUDE_DEPS.includes(name) || version.includes('workspace:')) {
      continue;
    }
    
    // If dependency exists, check for version conflicts
    if (merged[name] && merged[name] !== version) {
      console.warn(`⚠️  Version conflict for ${name}: ${merged[name]} vs ${version}`);
      // Keep the newer version (simple heuristic)
      if (version > merged[name]) {
        merged[name] = version;
      }
    } else {
      merged[name] = version;
    }
  }
  
  return merged;
};

// Main merge function
const mergePackages = () => {
  console.log('📦 Starting package.json merge...\n');
  
  // Load root package.json
  const rootPath = path.join(process.cwd(), 'package.json');
  const rootPackage = loadPackageJson(rootPath);
  
  if (!rootPackage) {
    console.error('❌ Could not load root package.json');
    process.exit(1);
  }
  
  // Create merged package
  const mergedPackage = {
    name: 'dialup-deploy',
    version: rootPackage.version || '0.1.0',
    description: rootPackage.description || 'A simple way to deploy websites with automatic SSL and subdomains',
    type: 'module',
    main: 'dist/index.js',
    bin: {
      'dialup-deploy': './dist/cli/index.js',
      'dd': './dist/cli/index.js'
    },
    scripts: {},
    keywords: [
      'bun',
      'deploy',
      'static-site',
      'ssl',
      'subdomain',
      'hosting'
    ],
    author: rootPackage.author || '',
    license: 'MIT',
    dependencies: {},
    devDependencies: rootPackage.devDependencies || {},
    engines: {
      bun: '>=1.0.0'
    },
    repository: rootPackage.repository,
    publishConfig: {
      access: 'public'
    }
  };
  
  // Collect all dependencies from packages
  let allDependencies = {};
  let allDevDependencies = {};
  const allScripts = {};
  
  for (const packageName of PACKAGES) {
    const packagePath = path.join(process.cwd(), 'packages', packageName, 'package.json');
    const pkg = loadPackageJson(packagePath);
    
    if (pkg) {
      console.log(`📋 Processing ${packageName}...`);
      
      // Merge dependencies
      if (pkg.dependencies) {
        allDependencies = mergeDependencies(allDependencies, pkg.dependencies);
      }
      
      // Merge dev dependencies
      if (pkg.devDependencies) {
        allDevDependencies = mergeDependencies(allDevDependencies, pkg.devDependencies);
      }
      
      // Collect scripts (prefix with package name to avoid conflicts)
      if (pkg.scripts) {
        for (const [scriptName, scriptCmd] of Object.entries(pkg.scripts)) {
          // Don't prefix build scripts
          if (scriptName === 'build' || scriptName === 'dev') {
            allScripts[`${packageName}:${scriptName}`] = scriptCmd;
          }
        }
      }
    }
  }
  
  // Add merged dependencies
  mergedPackage.dependencies = allDependencies;
  mergedPackage.devDependencies = {
    ...allDevDependencies,
    ...mergedPackage.devDependencies
  };
  
  // Sort dependencies alphabetically
  mergedPackage.dependencies = Object.keys(mergedPackage.dependencies)
    .sort()
    .reduce((obj, key) => {
      obj[key] = mergedPackage.dependencies[key];
      return obj;
    }, {});
  
  mergedPackage.devDependencies = Object.keys(mergedPackage.devDependencies)
    .sort()
    .reduce((obj, key) => {
      obj[key] = mergedPackage.devDependencies[key];
      return obj;
    }, {});
  
  // Create unified scripts
  mergedPackage.scripts = {
    'start': 'bun run dist/cli/index.js start',
    'dev': 'bun run build:watch & bun run start',
    'build': 'bun run clean && bun run build:tsc && bun run build:bundle',
    'build:tsc': 'tsc',
    'build:bundle': 'bun build src/cli/index.ts --outdir dist/cli --target bun --minify',
    'build:watch': 'tsc --watch',
    'clean': 'rm -rf dist',
    'typecheck': 'tsc --noEmit',
    'lint': 'eslint src',
    'test': 'bun test',
    ...allScripts
  };
  
  // Remove workspace configuration
  delete mergedPackage.workspaces;
  
  // Create new package.json
  const newPackagePath = path.join(process.cwd(), 'package.consolidated.json');
  fs.writeFileSync(newPackagePath, JSON.stringify(mergedPackage, null, 2) + '\n');
  
  console.log(`\n✅ Merged package.json created at: package.consolidated.json`);
  console.log(`📊 Total dependencies: ${Object.keys(mergedPackage.dependencies).length}`);
  console.log(`📊 Total devDependencies: ${Object.keys(mergedPackage.devDependencies).length}`);
  
  // Create migration instructions
  const instructions = `
# Package Consolidation Complete

## Merged Package Statistics
- Dependencies: ${Object.keys(mergedPackage.dependencies).length}
- Dev Dependencies: ${Object.keys(mergedPackage.devDependencies).length}
- Scripts: ${Object.keys(mergedPackage.scripts).length}

## Next Steps

1. Review the merged package.json:
   - Check for any missing dependencies
   - Verify script commands are correct
   - Update any package-specific configurations

2. Replace current package.json:
   \`\`\`bash
   cp package.json package.original.json
   cp package.consolidated.json package.json
   \`\`\`

3. Install dependencies:
   \`\`\`bash
   rm -rf node_modules
   bun install
   \`\`\`

4. Update TypeScript configuration for new structure

5. Test the build:
   \`\`\`bash
   bun run build
   \`\`\`
`;
  
  fs.writeFileSync('CONSOLIDATION_REPORT.md', instructions);
  console.log('\n📝 Instructions written to CONSOLIDATION_REPORT.md');
};

// Run if executed directly
mergePackages();

export { mergePackages, mergeDependencies };