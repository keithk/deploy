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

async function fixTypeImports() {
  console.log('Fixing all type imports...');
  
  const files = await findAllTsFiles('./src');
  
  for (const file of files) {
    let content = await readFile(file, 'utf-8');
    let changed = false;
    
    // Fix imports from @types without /hono
    content = content.replace(
      /import type \{ ([^}]+) \} from ["']@types["'];?/g,
      (match, imports) => {
        const importList = imports.split(',').map(s => s.trim());
        const honoTypes = ['HonoVariables', 'HonoContext', 'AuthenticatedContext', 'AdminContext', 'AppContext', 'AuthenticatedUser', 'SiteData'];
        const honoImports = importList.filter(imp => honoTypes.includes(imp));
        const otherImports = importList.filter(imp => !honoTypes.includes(imp));
        
        if (honoImports.length > 0) {
          changed = true;
          let result = '';
          if (honoImports.length > 0) {
            result += `import type { ${honoImports.join(', ')} } from "@types/hono";\n`;
          }
          if (otherImports.length > 0) {
            result += `import type { ${otherImports.join(', ')} } from "@types";`;
          }
          return result.trim();
        }
        return match;
      }
    );
    
    // Fix imports without type keyword
    content = content.replace(
      /import \{ ([^}]+) \} from ["']@types["'];?/g,
      (match, imports) => {
        const importList = imports.split(',').map(s => s.trim());
        const honoTypes = ['HonoVariables', 'HonoContext', 'AuthenticatedContext', 'AdminContext', 'AppContext', 'AuthenticatedUser', 'SiteData'];
        const honoImports = importList.filter(imp => honoTypes.includes(imp));
        const otherImports = importList.filter(imp => !honoTypes.includes(imp));
        
        if (honoImports.length > 0) {
          changed = true;
          let result = '';
          if (honoImports.length > 0) {
            result += `import type { ${honoImports.join(', ')} } from "@types/hono";\n`;
          }
          if (otherImports.length > 0) {
            result += `import { ${otherImports.join(', ')} } from "@types";`;
          }
          return result.trim();
        }
        return match;
      }
    );
    
    // Replace Context<AppContext> with Context<{ Variables: HonoVariables }>
    if (content.includes('Context<AppContext>')) {
      content = content.replace(/Context<AppContext>/g, 'Context<{ Variables: HonoVariables }>');
      changed = true;
    }
    
    // Replace new Hono<AppContext> with new Hono<{ Variables: HonoVariables }>
    if (content.includes('new Hono<AppContext>')) {
      content = content.replace(/new Hono<AppContext>/g, 'new Hono<{ Variables: HonoVariables }>');
      changed = true;
    }
    
    // If we're using HonoVariables but don't have it imported
    if (content.includes('HonoVariables') && !content.includes('import') && !content.includes('HonoVariables from')) {
      // Add import at the top after existing imports
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
    
    // Clean up duplicate imports
    const lines = content.split('\n');
    const uniqueImports = new Set();
    const cleanedLines = [];
    
    for (const line of lines) {
      if (line.startsWith('import ') && line.includes('@types')) {
        if (uniqueImports.has(line)) {
          changed = true;
          continue; // Skip duplicate
        }
        uniqueImports.add(line);
      }
      cleanedLines.push(line);
    }
    
    if (changed) {
      content = cleanedLines.join('\n');
      await writeFile(file, content);
      console.log(`✓ Fixed: ${file}`);
    }
  }
  
  console.log('Done fixing type imports!');
}

await fixTypeImports();