#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'fs';
import { Glob } from 'bun';
import { resolve, dirname, relative } from 'path';

const rootDir = resolve(process.cwd());
const srcDir = resolve(rootDir, 'src');

// Fix relative imports from '../core' to '../../core' in server directory
async function fixServerCoreImports() {
  const glob = new Glob('src/server/**/*.ts');
  const files = Array.from(glob.scanSync({ cwd: rootDir }));
  
  for (const file of files) {
    const filePath = resolve(rootDir, file);
    let content = readFileSync(filePath, 'utf-8');
    const original = content;
    
    // Fix imports from '../core' to '../../core'
    content = content.replace(/from ['"]\.\.\/core['"]/g, 'from "../../core"');
    
    if (content !== original) {
      writeFileSync(filePath, content);
      console.log(`Fixed imports in ${file}`);
    }
  }
}

// Fix @actions/registry imports to use relative paths
async function fixActionsRegistryImports() {
  const glob = new Glob('src/**/*.ts');
  const files = Array.from(glob.scanSync({ cwd: rootDir }));
  
  for (const file of files) {
    const filePath = resolve(rootDir, file);
    let content = readFileSync(filePath, 'utf-8');
    const original = content;
    
    // Replace @actions/registry with relative path
    if (content.includes('@actions/registry')) {
      const fileDir = dirname(filePath);
      const registryPath = resolve(srcDir, 'server/actions/registry.ts');
      let relativePath = relative(fileDir, registryPath);
      
      // Remove .ts extension and ensure it starts with ./
      relativePath = relativePath.replace(/\.ts$/, '');
      if (!relativePath.startsWith('.')) {
        relativePath = './' + relativePath;
      }
      
      content = content.replace(/@actions\/registry/g, relativePath);
    }
    
    if (content !== original) {
      writeFileSync(filePath, content);
      console.log(`Fixed @actions/registry imports in ${file}`);
    }
  }
}

async function main() {
  console.log('Fixing import paths...\n');
  
  await fixServerCoreImports();
  await fixActionsRegistryImports();
  
  console.log('\nDone!');
}

main().catch(console.error);