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
  // Core imports
  { from: /from ['"]@core\/database\/database['"]/g, to: `from '@database/database'` },
  { from: /from ['"]\.\.\/\.\.\/core\/database\/database['"]/g, to: `from '../../database/database'` },
  { from: /from ['"]\.\.\/core\/database\/database['"]/g, to: `from '../database/database'` },
  { from: /from ['"]@core\/database\/models\/user['"]/g, to: `from '@database/models/user'` },
  { from: /from ['"]\.\.\/\.\.\/core\/database\/models\/user['"]/g, to: `from '../../database/models/user'` },
  { from: /from ['"]@core\/auth\/(.*?)['"]/g, to: `from '@auth/$1'` },
  { from: /from ['"]\.\.\/\.\.\/core\/auth\/(.*?)['"]/g, to: `from '../../auth/$1'` },
  { from: /from ['"]\.\.\/core\/auth\/(.*?)['"]/g, to: `from '../auth/$1'` },
  { from: /from ['"]@core\/utils\/(.*?)['"]/g, to: `from '@utils/$1'` },
  { from: /from ['"]\.\.\/\.\.\/core\/utils\/(.*?)['"]/g, to: `from '../../utils/$1'` },
  { from: /from ['"]\.\.\/core\/utils\/(.*?)['"]/g, to: `from '../utils/$1'` },
  { from: /from ['"]@core\/config\/(.*?)['"]/g, to: `from '../config/$1'` },
  { from: /from ['"]\.\.\/\.\.\/core\/config\/(.*?)['"]/g, to: `from '../../config/$1'` },
  { from: /from ['"]@core\/types['"]/g, to: `from '@types'` },
  { from: /from ['"]\.\.\/\.\.\/core\/types['"]/g, to: `from '@types'` },
  { from: /from ['"]\.\.\/core\/types['"]/g, to: `from '@types'` },
  { from: /from ['"]@core\/index['"]/g, to: `from '@types'` },
  { from: /from ['"]\.\.\/\.\.\/core\/index['"]/g, to: `from '@types'` },
  { from: /from ['"]\.\.\/core\/index['"]/g, to: `from '@types'` },
  { from: /from ['"]\.\.\/\.\.\/core['"]/g, to: `from '@types'` },
  { from: /from ['"]\.\.\/core['"]/g, to: `from '@types'` },
  { from: /from ['"]@core['"]/g, to: `from '@types'` },
  
  // Actions imports
  { from: /from ['"]@actions\/(.*?)['"]/g, to: `from '../server/actions/$1'` },
  { from: /from ['"]\.\.\/\.\.\/actions\/(.*?)['"]/g, to: `from '../../server/actions/$1'` },
  { from: /from ['"]\.\.\/actions\/(.*?)['"]/g, to: `from '../server/actions/$1'` },
  { from: /from ['"]\.\.\/\.\.\/actions['"]/g, to: `from '../../server/actions'` },
  { from: /from ['"]\.\.\/actions['"]/g, to: `from '../server/actions'` },
  
  // Server imports
  { from: /from ['"]@server\/(.*?)['"]/g, to: `from '../server/$1'` },
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