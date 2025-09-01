#!/usr/bin/env bun
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

async function updateFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  
  // Skip if no logging import
  if (!content.includes('utils/logging')) {
    return false;
  }
  
  // Update imports from ../utils/logging or ../../utils/logging to @utils/logging
  let updated = content
    .replace(/from ['"]\.\.\/utils\/logging['"]/g, 'from "@utils/logging"')
    .replace(/from ['"]\.\.\/\.\.\/utils\/logging['"]/g, 'from "@utils/logging"')
    .replace(/from ['"]\.\.\/core\/utils\/logging['"]/g, 'from "@utils/logging"')
    .replace(/from ['"]\.\.\/server\/utils\/logging['"]/g, 'from "@utils/logging"');
    
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
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      if (await updateFile(fullPath)) {
        count++;
      }
    }
  }
  
  return count;
}

console.log('Updating logging imports...');
const count = await processDirectory('src');
console.log(`Updated ${count} files`);