#!/usr/bin/env node

/**
 * Codemod to transform package imports to relative paths
 * Transforms @keithk/deploy-* imports to relative paths
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapping of package names to their new relative locations
const PACKAGE_MAP = {
  '@keithk/deploy-core': 'core',
  '@keithk/deploy-server': 'server',
  '@keithk/deploy-actions': 'actions',
  '@keithk/deploy-cli': 'cli'
};

// Transform function for jscodeshift
const transformImports = (fileInfo, api) => {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  
  // Get the file's directory relative to src
  const fileDir = path.dirname(fileInfo.path);
  const srcIndex = fileDir.indexOf('/src/');
  const relativeDir = srcIndex !== -1 ? fileDir.substring(srcIndex + 5) : '';
  
  // Transform import declarations
  root.find(j.ImportDeclaration).forEach(path => {
    const importSource = path.value.source.value;
    
    // Check if this is one of our packages
    const packageName = Object.keys(PACKAGE_MAP).find(pkg => importSource.startsWith(pkg));
    if (packageName) {
      const targetDir = PACKAGE_MAP[packageName];
      const subPath = importSource.substring(packageName.length);
      
      // Calculate relative path from current file to target
      const currentDepth = relativeDir.split('/').filter(Boolean).length;
      const upPath = currentDepth > 0 ? '../'.repeat(currentDepth) : './';
      const newImport = `${upPath}${targetDir}${subPath}`;
      
      // Update the import
      path.value.source.value = newImport;
    }
  });
  
  // Transform require statements (for any CommonJS)
  root.find(j.CallExpression, {
    callee: { name: 'require' }
  }).forEach(path => {
    if (path.value.arguments.length > 0 && path.value.arguments[0].type === 'Literal') {
      const requireSource = path.value.arguments[0].value;
      
      const packageName = Object.keys(PACKAGE_MAP).find(pkg => requireSource.startsWith(pkg));
      if (packageName) {
        const targetDir = PACKAGE_MAP[packageName];
        const subPath = requireSource.substring(packageName.length);
        
        const currentDepth = relativeDir.split('/').filter(Boolean).length;
        const upPath = currentDepth > 0 ? '../'.repeat(currentDepth) : './';
        const newRequire = `${upPath}${targetDir}${subPath}`;
        
        path.value.arguments[0].value = newRequire;
      }
    }
  });
  
  return root.toSource();
};

// Standalone transformer without jscodeshift dependency
const transformImportsRegex = (content, filePath) => {
  // Determine the file's location relative to src
  const srcIndex = filePath.indexOf('/src/');
  if (srcIndex === -1) return content;
  
  const relativeDir = filePath.substring(srcIndex + 5, filePath.lastIndexOf('/'));
  const depth = relativeDir.split('/').filter(Boolean).length;
  
  let transformed = content;
  
  // Transform each package import
  Object.entries(PACKAGE_MAP).forEach(([packageName, targetDir]) => {
    // Calculate relative path
    const upPath = depth > 0 ? '../'.repeat(depth) : './';
    const relativePath = `${upPath}${targetDir}`;
    
    // Replace import statements
    const importRegex = new RegExp(
      `(import\\s+(?:{[^}]*}|\\*\\s+as\\s+\\w+|\\w+)\\s+from\\s+['"])${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^'"]*['"])`,
      'g'
    );
    transformed = transformed.replace(importRegex, `$1${relativePath}$2`);
    
    // Replace require statements
    const requireRegex = new RegExp(
      `(require\\s*\\(\\s*['"])${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^'"]*['"]\\s*\\))`,
      'g'
    );
    transformed = transformed.replace(requireRegex, `$1${relativePath}$2`);
    
    // Replace dynamic imports
    const dynamicImportRegex = new RegExp(
      `(import\\s*\\(\\s*['"])${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^'"]*['"]\\s*\\))`,
      'g'
    );
    transformed = transformed.replace(dynamicImportRegex, `$1${relativePath}$2`);
  });
  
  return transformed;
};

// Process a single file
const processFile = (filePath) => {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx') && !filePath.endsWith('.js')) {
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const transformed = transformImportsRegex(content, filePath);
  
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
const srcDir = process.argv[2] || path.join(process.cwd(), 'src');

if (!fs.existsSync(srcDir)) {
  console.error(`Source directory not found: ${srcDir}`);
  process.exit(1);
}

console.log('🔄 Starting import transformation...');
console.log(`📁 Processing directory: ${srcDir}`);

const stats = processDirectory(srcDir);

console.log('\n✅ Transformation complete!');
console.log(`📊 Files processed: ${stats.processed}`);
console.log(`✏️  Files transformed: ${stats.transformed}`);

export { transformImportsRegex, processFile, processDirectory };