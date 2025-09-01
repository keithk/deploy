#!/usr/bin/env bun
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

async function updateFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  
  // Track if we made changes
  let updated = content;
  
  // Update imports from core/types
  updated = updated.replace(/from ['"]@core\/types['"]/g, 'from "@types"');
  updated = updated.replace(/from ['"]\.\.\/core\/types['"]/g, 'from "@types"');
  updated = updated.replace(/from ['"]\.\.\/\.\.\/core\/types['"]/g, 'from "@types"');
  updated = updated.replace(/from ['"]\.\.\/\.\.\/\.\.\/core\/types['"]/g, 'from "@types"');
  
  // Update imports from actions/types
  updated = updated.replace(/from ['"]@actions\/types['"]/g, 'from "@types"');
  updated = updated.replace(/from ['"]\.\.\/actions\/types['"]/g, 'from "@types"');
  updated = updated.replace(/from ['"]\.\.\/\.\.\/actions\/types['"]/g, 'from "@types"');
  
  // Update specific type file imports
  updated = updated.replace(/from ['"]@core\/types\/(.*?)['"]/g, 'from "@types/$1"');
  updated = updated.replace(/from ['"]\.\.\/types\/(.*?)['"]/g, 'from "@types/$1"');
  updated = updated.replace(/from ['"]\.\.\/\.\.\/types\/(.*?)['"]/g, 'from "@types/$1"');
  
  // Update export statements
  updated = updated.replace(/export \* from ['"]\.\/types['"]/g, 'export * from "@types"');
  
  if (updated !== content) {
    await writeFile(filePath, updated);
    console.log(`Updated: ${filePath}`);
    return true;
  }
  
  return false;
}

async function processDirectory(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  let count = 0;
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      count += await processDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      if (await updateFile(fullPath)) {
        count++;
      }
    }
  }
  
  return count;
}

console.log('Updating type imports...');
const count = await processDirectory('src');
console.log(`Updated ${count} files`);