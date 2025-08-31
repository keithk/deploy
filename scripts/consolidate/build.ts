#!/usr/bin/env bun

/**
 * Unified build script for consolidated package
 */

import { $ } from 'bun';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const BUILD_DIR = 'dist';

// Clean build directory
console.log('🧹 Cleaning build directory...');
await $`rm -rf ${BUILD_DIR}`;
mkdirSync(BUILD_DIR, { recursive: true });

// TypeScript compilation
console.log('📦 Compiling TypeScript...');
await $`tsc`;

// Bundle CLI entry point
console.log('🎯 Bundling CLI entry point...');
await $`bun build src/cli/index.ts --outfile dist/cli/index.js --target bun --minify`;

// Bundle server entry point
console.log('🎯 Bundling server entry point...');
await $`bun build src/server/index.ts --outfile dist/server/index.js --target bun --minify`;

// Make CLI executable
await $`chmod +x dist/cli/index.js`;

// Add shebang to CLI
const cliContent = await Bun.file('dist/cli/index.js').text();
if (!cliContent.startsWith('#!/usr/bin/env bun')) {
  await Bun.write('dist/cli/index.js', `#!/usr/bin/env bun\n${cliContent}`);
}

console.log('✅ Build complete!');
