#!/usr/bin/env bun
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

async function updateFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  
  // Skip if no caddy import
  if (!content.includes('caddy') && !content.includes('caddyfile')) {
    return false;
  }
  
  // Update imports
  let updated = content
    // From core/utils/caddyfile
    .replace(/from ['"]@core\/utils\/caddyfile['"]/g, 'from "@utils/caddy"')
    .replace(/from ['"]\.\.\/\.\.\/core\/utils\/caddyfile['"]/g, 'from "@utils/caddy"')
    .replace(/from ['"]\.\.\/core\/utils\/caddyfile['"]/g, 'from "@utils/caddy"')
    .replace(/from ['"]\.\/caddyfile['"]/g, 'from "@utils/caddy"')
    // From cli/utils/caddy
    .replace(/from ['"]\.\.\/utils\/caddy['"]/g, 'from "@utils/caddy"')
    .replace(/from ['"]\.\/caddy['"]/g, 'from "@utils/caddy"')
    // Export statements
    .replace(/export \* from ['"]\.\/caddyfile['"]/g, 'export * from "@utils/caddy"')
    .replace(/export \* from ['"]\.\/caddy['"]/g, 'export * from "@utils/caddy"');
    
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

console.log('Updating caddy imports...');
const count = await processDirectory('src');
console.log(`Updated ${count} files`);