#!/usr/bin/env bun

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

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

async function fixFinalTypes() {
  console.log('Fixing final type issues...');
  
  const files = await findAllTsFiles('./src');
  
  for (const file of files) {
    let content = await readFile(file, 'utf-8');
    let changed = false;
    
    // If file uses Context but doesn't import it from hono
    if (content.includes('Context<') && content.includes("from 'hono'")) {
      const honoImportRegex = /import \{ ([^}]+) \} from 'hono';/;
      const match = content.match(honoImportRegex);
      
      if (match) {
        const imports = match[1].split(',').map(s => s.trim());
        if (!imports.includes('Context')) {
          content = content.replace(
            honoImportRegex,
            `import { ${[...imports, 'Context'].join(', ')} } from 'hono';`
          );
          changed = true;
        }
      }
    }
    
    // Replace standalone HonoContext with Context<{ Variables: HonoVariables }>
    if (content.includes('HonoContext') && !content.includes('type HonoContext =')) {
      content = content.replace(/: HonoContext/g, ': Context<{ Variables: HonoVariables }>');
      changed = true;
    }
    
    // Fix any Hono instantiation without proper typing
    content = content.replace(
      /new Hono\(\)/g,
      'new Hono<{ Variables: HonoVariables }>()'
    );
    if (content.includes('new Hono<{ Variables: HonoVariables }>()')) {
      changed = true;
    }
    
    // Fix routes that have AuthenticatedContext but are instantiated wrong
    if (content.includes('Hono<AuthenticatedContext>')) {
      content = content.replace(
        /new Hono<AuthenticatedContext>\(\)/g,
        'new Hono<{ Variables: HonoVariables }>()'
      );
      changed = true;
    }
    
    // Ensure all route handlers have proper typing
    content = content.replace(
      /\.(?:get|post|put|delete|patch)\(['"]([^'"]+)['"],\s*\(c\)\s*=>/g,
      (match, route) => {
        changed = true;
        return `.${match.split('.')[1].split('(')[0]}('${route}', (c: Context<{ Variables: HonoVariables }>) =>`;
      }
    );
    
    // Fix async handlers too
    content = content.replace(
      /\.(?:get|post|put|delete|patch)\(['"]([^'"]+)['"],\s*async\s*\(c\)\s*=>/g,
      (match, route) => {
        changed = true;
        return `.${match.split('.')[1].split('(')[0]}('${route}', async (c: Context<{ Variables: HonoVariables }>) =>`;
      }
    );
    
    if (changed) {
      await writeFile(file, content);
      console.log(`✓ Fixed: ${file}`);
    }
  }
  
  console.log('Done fixing final types!');
}

await fixFinalTypes();