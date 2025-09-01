#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'fs';
import { Glob } from 'bun';

// Find all TypeScript files
const glob = new Glob('src/**/*.ts');
const files = []
for await (const file of glob.scan('.')) {
  files.push(file);
}

const replacements = [
  // Change function imports from @types to the main module
  { 
    from: /import\s*{\s*([^}]*(?:debug|info|warn|error|LogLevel|setLogLevel|discoverSites|detectPackageManager|getPackageManagerCommand|processModel|isPortInUse|updateBuildCache|registerBuiltInSite)[^}]*)\s*}\s*from\s*['"]@types['"]/g,
    to: `import { $1 } from '..'` 
  },
  // Fix ../server/actions/registry imports
  { 
    from: /from ['"]\.\.\/server\/actions\/registry['"]/g,
    to: `from './actions/registry'`
  },
  // Fix ../../core imports in database files
  {
    from: /from ['"]\.\.\/\.\.\/core\/database\/(.*?)['"]/g,
    to: `from '../$1'`
  },
  // Fix ../core imports
  {
    from: /from ['"]\.\.\/core['"]/g,
    to: `from '..'`
  },
  // Fix ../../core imports
  {
    from: /from ['"]\.\.\/\.\.\/core['"]/g,
    to: `from '../..'`
  }
];

let totalFixed = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  let modified = false;
  
  for (const { from, to } of replacements) {
    const newContent = content.replace(from, to);
    if (newContent !== content) {
      content = newContent;
      modified = true;
    }
  }
  
  if (modified) {
    writeFileSync(file, content);
    console.log(`Fixed imports in: ${file}`);
    totalFixed++;
  }
}

console.log(`\nFixed imports in ${totalFixed} files`);