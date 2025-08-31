#!/usr/bin/env node

/**
 * Script to update TypeScript configuration for consolidated structure
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// New TypeScript configuration for consolidated structure
const createNewTsConfig = () => ({
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": "./src",
    "paths": {
      "@core/*": ["core/*"],
      "@server/*": ["server/*"],
      "@actions/*": ["actions/*"],
      "@cli/*": ["cli/*"],
      "@admin/*": ["admin/*"],
      "@editor/*": ["editor/*"]
    },
    "types": ["bun-types"],
    "allowImportingTsExtensions": false,
    "moduleDetection": "force",
    "noUncheckedIndexedAccess": true,
    "strictNullChecks": true,
    "allowJs": true,
    "checkJs": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "incremental": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts",
    "**/*.spec.ts"
  ]
});

// Update tsconfig.json
const updateTsConfig = () => {
  console.log('📝 Updating TypeScript configuration...\n');
  
  const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
  
  // Backup existing tsconfig
  if (fs.existsSync(tsconfigPath)) {
    const backupPath = path.join(process.cwd(), 'tsconfig.backup.json');
    fs.copyFileSync(tsconfigPath, backupPath);
    console.log(`✅ Backed up existing tsconfig.json to tsconfig.backup.json`);
  }
  
  // Create new tsconfig
  const newConfig = createNewTsConfig();
  fs.writeFileSync(tsconfigPath, JSON.stringify(newConfig, null, 2) + '\n');
  
  console.log('✅ Created new tsconfig.json for consolidated structure');
  
  // Remove old package-level tsconfigs
  const packagesToClean = ['cli', 'server', 'core', 'actions'];
  for (const pkg of packagesToClean) {
    const pkgTsConfig = path.join(process.cwd(), 'packages', pkg, 'tsconfig.json');
    if (fs.existsSync(pkgTsConfig)) {
      console.log(`🗑️  Removing ${pkg}/tsconfig.json`);
      // Don't actually delete, just rename
      fs.renameSync(pkgTsConfig, `${pkgTsConfig}.old`);
    }
  }
  
  console.log('\n📋 TypeScript Path Aliases Created:');
  console.log('  @core/*    → src/core/*');
  console.log('  @server/*  → src/server/*');
  console.log('  @actions/* → src/actions/*');
  console.log('  @cli/*     → src/cli/*');
  console.log('  @admin/*   → src/admin/*');
  console.log('  @editor/*  → src/editor/*');
  
  return newConfig;
};

// Create build script
const createBuildScript = () => {
  const buildScript = `#!/usr/bin/env bun

/**
 * Unified build script for consolidated package
 */

import { $ } from 'bun';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const BUILD_DIR = 'dist';

// Clean build directory
console.log('🧹 Cleaning build directory...');
await $\`rm -rf \${BUILD_DIR}\`;
mkdirSync(BUILD_DIR, { recursive: true });

// TypeScript compilation
console.log('📦 Compiling TypeScript...');
await $\`tsc\`;

// Bundle CLI entry point
console.log('🎯 Bundling CLI entry point...');
await $\`bun build src/cli/index.ts --outfile dist/cli/index.js --target bun --minify\`;

// Bundle server entry point
console.log('🎯 Bundling server entry point...');
await $\`bun build src/server/index.ts --outfile dist/server/index.js --target bun --minify\`;

// Make CLI executable
await $\`chmod +x dist/cli/index.js\`;

// Add shebang to CLI
const cliContent = await Bun.file('dist/cli/index.js').text();
if (!cliContent.startsWith('#!/usr/bin/env bun')) {
  await Bun.write('dist/cli/index.js', \`#!/usr/bin/env bun\\n\${cliContent}\`);
}

console.log('✅ Build complete!');
`;
  
  const buildPath = path.join(process.cwd(), 'scripts', 'consolidate', 'build.ts');
  fs.writeFileSync(buildPath, buildScript);
  fs.chmodSync(buildPath, '755');
  
  console.log('✅ Created build script at scripts/consolidate/build.ts');
};

// Main execution
updateTsConfig();
createBuildScript();

console.log('\n✅ TypeScript configuration updated successfully!');
console.log('\nNext steps:');
console.log('1. Run the directory restructuring');
console.log('2. Transform imports');
console.log('3. Test the build with: bun scripts/consolidate/build.ts');

export { updateTsConfig, createNewTsConfig };