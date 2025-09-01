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

async function fixDuplicateImports() {
  console.log('Fixing duplicate imports...');
  
  const files = await findAllTsFiles('./src');
  
  for (const file of files) {
    let content = await readFile(file, 'utf-8');
    let changed = false;
    
    // Remove duplicate Context imports
    const lines = content.split('\n');
    const seenImports = new Set();
    const cleanedLines = [];
    
    for (const line of lines) {
      // Check for duplicate hono imports
      if (line.includes("import") && line.includes("from 'hono'")) {
        const normalized = line.replace(/\s+/g, ' ').trim();
        if (seenImports.has(normalized)) {
          changed = true;
          continue; // Skip duplicate
        }
        seenImports.add(normalized);
      }
      
      // Check for duplicate Context imports specifically
      if (line === "import { Context } from 'hono';" && seenImports.has('context-import')) {
        changed = true;
        continue;
      }
      if (line.includes("{ Context }") && line.includes("from 'hono'")) {
        seenImports.add('context-import');
      }
      
      cleanedLines.push(line);
    }
    
    // Also add missing HonoVariables imports where needed
    content = cleanedLines.join('\n');
    
    // If file uses HonoVariables but doesn't import it
    if (content.includes('HonoVariables') && 
        !content.includes('HonoVariables from') &&
        !content.includes('type HonoVariables =')) {
      // Check if there's already an import from @types/hono
      const honoTypeImportRegex = /import type \{ ([^}]+) \} from ["']@types\/hono["'];?/;
      const match = content.match(honoTypeImportRegex);
      
      if (match) {
        const imports = match[1].split(',').map(s => s.trim());
        if (!imports.includes('HonoVariables')) {
          content = content.replace(
            honoTypeImportRegex,
            `import type { ${[...imports, 'HonoVariables'].join(', ')} } from "@types/hono";`
          );
          changed = true;
        }
      } else {
        // Add new import after other imports
        const lines = content.split('\n');
        let lastImportIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('import ')) {
            lastImportIndex = i;
          }
        }
        if (lastImportIndex >= 0) {
          lines.splice(lastImportIndex + 1, 0, 'import type { HonoVariables } from "@types/hono";');
          content = lines.join('\n');
          changed = true;
        }
      }
    }
    
    if (changed) {
      await writeFile(file, content);
      console.log(`✓ Fixed: ${file}`);
    }
  }
  
  console.log('Done fixing duplicate imports!');
}

await fixDuplicateImports();