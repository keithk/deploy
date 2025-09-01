#!/usr/bin/env bun
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

async function updateFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  
  // Skip if no package manager import
  if (!content.includes('packageManager') && !content.includes('package-manager')) {
    return false;
  }
  
  // Update imports
  let updated = content
    // From core/utils/packageManager
    .replace(/from ['"]@core\/utils\/packageManager['"]/g, 'from "@utils/packageManager"')
    .replace(/from ['"]\.\.\/\.\.\/core\/utils\/packageManager['"]/g, 'from "@utils/packageManager"')
    // From cli/utils/package-manager
    .replace(/from ['"]\.\.\/utils\/package-manager['"]/g, 'from "@utils/packageManager"')
    .replace(/from ['"]\.\/package-manager['"]/g, 'from "@utils/packageManager"')
    // Export statements
    .replace(/export \* from ['"]\.\/packageManager['"]/g, 'export * from "@utils/packageManager"')
    .replace(/export \* from ['"]\.\/package-manager['"]/g, 'export * from "@utils/packageManager"');
    
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

console.log('Updating package manager imports...');
const count = await processDirectory('src');
console.log(`Updated ${count} files`);