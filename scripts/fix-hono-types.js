#!/usr/bin/env bun

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

async function findFiles(dir, pattern) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.includes('node_modules') && !entry.name.startsWith('.')) {
      files.push(...await findFiles(fullPath, pattern));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      const content = await readFile(fullPath, 'utf-8');
      if (pattern.test(content)) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

async function fixHonoTypes() {
  console.log('Fixing Hono type inconsistencies...');
  
  // Find all route files that use Hono
  const honoFiles = await findFiles('./src', /new Hono[<(]/);
  
  for (const file of honoFiles) {
    let content = await readFile(file, 'utf-8');
    let changed = false;
    
    // Fix Hono instantiation patterns
    content = content.replace(
      /const (\w+) = new Hono<AppContext>\(\)/g,
      (match, varName) => {
        changed = true;
        return `const ${varName} = new Hono<{ Variables: HonoVariables }>()`;
      }
    );
    
    // Fix middleware type annotations
    content = content.replace(
      /\(c: Context<AppContext>, next: Next\)/g,
      (match) => {
        changed = true;
        return '(c: Context<{ Variables: HonoVariables }>, next: Next)';
      }
    );
    
    // Fix simple (c) => patterns that should be typed
    content = content.replace(
      /\(c\) => {/g,
      (match) => {
        // Only replace if it's in a route handler context
        if (content.includes('authRoutes.') || content.includes('Routes.') || content.includes('app.')) {
          changed = true;
          return '(c: Context<{ Variables: HonoVariables }>) => {';
        }
        return match;
      }
    );
    
    // Ensure HonoVariables is imported if used
    if (content.includes('HonoVariables') && !content.includes('import') && !content.includes('HonoVariables')) {
      const importLine = `import type { HonoVariables } from "@types/hono";\n`;
      if (!content.includes(importLine)) {
        content = importLine + content;
        changed = true;
      }
    }
    
    // Add missing imports
    if (content.includes('HonoVariables') && !content.includes('import') || 
        (content.includes('HonoVariables') && !content.includes('from "@types'))) {
      // Check if there's already a type import from @types
      const typeImportRegex = /import type \{([^}]+)\} from ["']@types(?:\/hono)?["'];?/;
      const match = content.match(typeImportRegex);
      
      if (match) {
        const imports = match[1].split(',').map(s => s.trim());
        if (!imports.includes('HonoVariables')) {
          content = content.replace(
            typeImportRegex,
            `import type { ${[...imports, 'HonoVariables'].join(', ')} } from "@types/hono";`
          );
          changed = true;
        }
      } else if (!content.includes('HonoVariables from')) {
        // Add new import after other imports
        const lastImportIndex = content.lastIndexOf('import ');
        if (lastImportIndex !== -1) {
          const endOfLine = content.indexOf('\n', lastImportIndex);
          content = content.slice(0, endOfLine + 1) + 
                   'import type { HonoVariables } from "@types/hono";\n' +
                   content.slice(endOfLine + 1);
          changed = true;
        }
      }
    }
    
    if (changed) {
      await writeFile(file, content);
      console.log(`✓ Fixed: ${file}`);
    }
  }
  
  console.log('Done fixing Hono types!');
}

await fixHonoTypes();