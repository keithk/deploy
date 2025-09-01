// Import Migration Script
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const sourceDirs = [
  'src/core',
  'src/actions',
  'src/server',
  'src/admin',
  'src/editor'
];

const importReplacements = {
  '@core/auth/sessions': '@auth/sessions',
  '@core/auth/password': '@auth/password',
  '@core/database/database': '@database/database',
  '@core/database/models/user': '@database/models/user'
};

function migrateImports(filePath: string) {
  let content = readFileSync(filePath, 'utf-8');
  let modified = false;

  Object.entries(importReplacements).forEach(([oldImport, newImport]) => {
    if (content.includes(`from '${oldImport}'`)) {
      content = content.replace(`from '${oldImport}'`, `from '${newImport}'`);
      modified = true;
    }
  });

  if (modified) {
    writeFileSync(filePath, content);
    console.log(`Updated imports in: ${filePath}`);
  }
}

function traverseDirectory(dir: string) {
  const files = readdirSync(dir);
  
  files.forEach(file => {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      traverseDirectory(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      migrateImports(fullPath);
    }
  });
}

function main() {
  console.log('Starting import migration...');
  
  traverseDirectory('src');
  
  console.log('Import migration complete.');
}

main();