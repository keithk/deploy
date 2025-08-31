#!/usr/bin/env node

/**
 * Convert relative imports to TypeScript path aliases
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Map of how to convert relative imports to aliases
const ALIAS_MAP = {
  'core': '@core',
  'server': '@server',
  'actions': '@actions',
  'cli': '@cli',
  'admin': '@admin',
  'editor': '@editor'
};

// Transform imports to use aliases
const transformToAliases = (content, filePath) => {
  let transformed = content;
  
  // Get the file's directory relative to src
  const srcIndex = filePath.indexOf('/src/');
  if (srcIndex === -1) return content;
  
  const fileDir = path.dirname(filePath.substring(srcIndex + 5));
  const currentModule = fileDir.split('/')[0];
  
  // Replace relative imports with aliases
  Object.entries(ALIAS_MAP).forEach(([moduleName, aliasName]) => {
    // Don't use alias for imports within the same module
    if (moduleName === currentModule) return;
    
    // Match various relative import patterns
    const patterns = [
      // ../module/path -> @module/path
      {
        regex: new RegExp(`(import[^'"]*['"])\\.\\./${moduleName}/([^'"]*['"])`, 'g'),
        replacement: `$1${aliasName}/$2`
      },
      // ../../module/path -> @module/path
      {
        regex: new RegExp(`(import[^'"]*['"])\\.\\.\\.\\./${moduleName}/([^'"]*['"])`, 'g'),
        replacement: `$1${aliasName}/$2`
      },
      // ../../../module/path -> @module/path
      {
        regex: new RegExp(`(import[^'"]*['"])\\.\\.\\.\\.\\.\\./${moduleName}/([^'"]*['"])`, 'g'),
        replacement: `$1${aliasName}/$2`
      }
    ];
    
    patterns.forEach(({ regex, replacement }) => {
      transformed = transformed.replace(regex, replacement);
    });
  });
  
  // Fix any remaining ../core/src/ patterns
  transformed = transformed.replace(/\.\.\/core\/src\//g, '@core/');
  transformed = transformed.replace(/\.\.\/\.\.\/core\/src\//g, '@core/');
  transformed = transformed.replace(/\.\.\/server\/src\//g, '@server/');
  transformed = transformed.replace(/\.\.\/\.\.\/server\/src\//g, '@server/');
  transformed = transformed.replace(/\.\.\/actions\/src\//g, '@actions/');
  transformed = transformed.replace(/\.\.\/cli\/src\//g, '@cli/');
  
  // Fix specific misplaced imports
  transformed = transformed.replace(/from ['"]\.\.\/utils\/built-in-sites['"]/g, `from '@cli/utils/built-in-sites'`);
  
  return transformed;
};

// Process a single file
const processFile = (filePath) => {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) {
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const transformed = transformToAliases(content, filePath);
  
  if (content !== transformed) {
    fs.writeFileSync(filePath, transformed);
    console.log(`✓ Transformed: ${filePath}`);
    return true;
  }
  return false;
};

// Process directory recursively
const processDirectory = (dir, stats = { processed: 0, transformed: 0 }) => {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules' && item !== 'dist') {
      processDirectory(fullPath, stats);
    } else if (stat.isFile()) {
      stats.processed++;
      if (processFile(fullPath)) {
        stats.transformed++;
      }
    }
  }
  
  return stats;
};

// Main execution
const srcDir = path.join(process.cwd(), 'src');

if (!fs.existsSync(srcDir)) {
  console.error(`Source directory not found: ${srcDir}`);
  process.exit(1);
}

console.log('🔄 Converting imports to TypeScript aliases...');
console.log(`📁 Processing directory: ${srcDir}`);

const stats = processDirectory(srcDir);

console.log('\n✅ Alias conversion complete!');
console.log(`📊 Files processed: ${stats.processed}`);
console.log(`✏️  Files transformed: ${stats.transformed}`);