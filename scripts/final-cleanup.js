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

async function finalCleanup() {
  console.log('Final cleanup of type imports...');
  
  const files = await findAllTsFiles('./src');
  
  for (const file of files) {
    let content = await readFile(file, 'utf-8');
    let changed = false;
    
    // Remove duplicate Context import lines
    const lines = content.split('\n');
    const cleanedLines = [];
    let hasContextImport = false;
    
    for (const line of lines) {
      // Remove standalone Context import if we already have it from Hono
      if (line === "import { Context } from 'hono';" && hasContextImport) {
        changed = true;
        continue;
      }
      
      // Track if we've seen Context in a Hono import
      if (line.includes("from 'hono'") && line.includes('Context')) {
        hasContextImport = true;
      }
      
      cleanedLines.push(line);
    }
    
    content = cleanedLines.join('\n');
    
    // Change imports from @types/hono to use the path in types/hono.ts
    content = content.replace(
      /import type \{ ([^}]+) \} from ["']@types\/hono["'];?/g,
      (match, imports) => {
        changed = true;
        // Just import from our local types file
        return `import type { ${imports} } from "@types/hono";`;
      }
    );
    
    // Remove the problematic @types/hono import from types/hono.ts itself
    if (file.includes('types/hono.ts')) {
      content = content.replace(
        /import type \{ HonoVariables \} from "@types\/hono";/g,
        ''
      );
      changed = true;
    }
    
    if (changed) {
      await writeFile(file, content);
      console.log(`✓ Fixed: ${file}`);
    }
  }
  
  console.log('Done with final cleanup!');
}

await finalCleanup();