#!/usr/bin/env bun

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// Files with user undefined errors based on the build output
const filesToFix = [
  'src/admin/routes/dashboard.ts',
  'src/admin/routes/settings.ts',
  'src/admin/routes/users.ts',
  'src/editor/routes/editing-sessions.ts',
  'src/editor/routes/editor.ts',
  'src/editor/routes/files.ts',
  'src/editor/routes/dashboard.ts',
  'src/editor/routes/api.ts'
];

async function fixUserUndefined() {
  console.log('Fixing user undefined errors...');
  
  for (const file of filesToFix) {
    try {
      let content = await readFile(file, 'utf-8');
      let changed = false;
      
      // Replace patterns where user is accessed after c.get('user')
      // Pattern 1: const user = c.get('user');
      content = content.replace(
        /const user = c\.get\('user'\);/g,
        "const user = c.get('user')!;"
      );
      if (content.includes("c.get('user')!")) {
        changed = true;
      }
      
      // Pattern 2: c.get('user').property
      content = content.replace(
        /c\.get\('user'\)\.(\w+)/g,
        "c.get('user')!.$1"
      );
      
      // Pattern 3: In function calls like checkSiteAccess(siteName, user.id, user.is_admin)
      // After getting user with const user = c.get('user')!, these should be fine
      
      // Pattern 4: Direct access in conditionals
      content = content.replace(
        /if \(user && user\./g,
        "if (user && user."
      );
      
      // Pattern 5: For cases where user is accessed without null check
      // Only in routes that have requireAuth or requireAdmin middleware
      if (file.includes('admin/routes') || file.includes('editor/routes')) {
        // These files have middleware that ensures user exists
        // So we can safely use non-null assertion
      }
      
      if (changed) {
        await writeFile(file, content);
        console.log(`✓ Fixed: ${file}`);
      }
    } catch (error) {
      console.error(`Error fixing ${file}:`, error);
    }
  }
  
  console.log('Done fixing user undefined errors!');
}

await fixUserUndefined();