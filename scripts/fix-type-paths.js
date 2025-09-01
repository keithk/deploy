#!/usr/bin/env bun

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, relative, dirname } from 'path';

async function findAllTsFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.includes('node_modules') && !entry.name.startsWith('.')) {
      files.push(...await findAllTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function getRelativePath(from, to) {
  // Calculate relative path from the file to src/types/hono
  const fromDir = dirname(from);
  let relativePath = relative(fromDir, to);
  
  // Ensure it starts with ./ or ../
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }
  
  // Remove .ts extension
  return relativePath.replace('.ts', '');
}

async function fixTypePaths() {
  console.log('Fixing type import paths...');
  
  const files = await findAllTsFiles('./src');
  const honoTypesPath = join(process.cwd(), 'src/types/hono.ts');
  
  for (const file of files) {
    // Skip the hono.ts file itself
    if (file.includes('types/hono.ts')) continue;
    
    let content = await readFile(file, 'utf-8');
    let changed = false;
    
    // Replace @types/hono imports with relative path to src/types/hono
    if (content.includes('@types/hono')) {
      const relativePath = getRelativePath(file, honoTypesPath);
      
      // Replace all variations of @types/hono imports
      content = content.replace(
        /from ["']@types\/hono["']/g,
        `from "${relativePath}"`
      );
      changed = true;
    }
    
    // Also fix @types/action and @types/site imports to use relative paths
    if (content.includes('@types/action')) {
      const actionTypesPath = join(process.cwd(), 'src/types/action.ts');
      const relativePath = getRelativePath(file, actionTypesPath);
      content = content.replace(
        /from ["']@types\/action["']/g,
        `from "${relativePath}"`
      );
      changed = true;
    }
    
    if (content.includes('@types/site')) {
      const siteTypesPath = join(process.cwd(), 'src/types/site.ts');
      const relativePath = getRelativePath(file, siteTypesPath);
      content = content.replace(
        /from ["']@types\/site["']/g,
        `from "${relativePath}"`
      );
      changed = true;
    }
    
    if (changed) {
      await writeFile(file, content);
      console.log(`✓ Fixed: ${file}`);
    }
  }
  
  console.log('Done fixing type paths!');
}

await fixTypePaths();