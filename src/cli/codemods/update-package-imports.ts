#!/usr/bin/env bun

/**
 * Codemod to update old package imports to new @keithk/deploy
 * 
 * Updates:
 * - @keithk/deploy-actions → @keithk/deploy
 * - @keithk/deploy-core → @keithk/deploy
 * - @keithk/deploy-server → @keithk/deploy
 * - @keithk/deploy-cli → @keithk/deploy
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { Glob } from 'bun';
import chalk from 'chalk';

const OLD_PACKAGES = [
  '@keithk/deploy-actions',
  '@keithk/deploy-core',
  '@keithk/deploy-server',
  '@keithk/deploy-cli'
];

const NEW_PACKAGE = '@keithk/deploy';

interface TransformResult {
  file: string;
  transformed: boolean;
  changes: string[];
}

function transformFile(filePath: string): TransformResult {
  const result: TransformResult = {
    file: filePath,
    transformed: false,
    changes: []
  };

  if (!existsSync(filePath)) {
    return result;
  }

  let content = readFileSync(filePath, 'utf-8');
  const originalContent = content;

  // Transform each old package import
  for (const oldPackage of OLD_PACKAGES) {
    const regex = new RegExp(
      `(['"\`])${oldPackage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(['"\`])`,
      'g'
    );
    
    if (regex.test(content)) {
      content = content.replace(regex, `$1${NEW_PACKAGE}$2`);
      result.changes.push(`${oldPackage} → ${NEW_PACKAGE}`);
    }
  }

  if (content !== originalContent) {
    writeFileSync(filePath, content);
    result.transformed = true;
  }

  return result;
}

async function runCodemod(targetPath: string = process.cwd()): Promise<void> {
  console.log(chalk.blue('🔄 Running import update codemod...\n'));
  
  // Find all TypeScript and JavaScript files
  const patterns = [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
    '**/*.mjs',
    '**/*.cjs'
  ];

  const files: string[] = [];
  for (const pattern of patterns) {
    const glob = new Glob(pattern);
    for await (const file of glob.scan({
      cwd: targetPath,
      onlyFiles: true
    })) {
      // Skip ignored directories
      if (file.includes('node_modules/') || 
          file.includes('dist/') || 
          file.includes('.next/') || 
          file.includes('build/')) {
        continue;
      }
      files.push(resolve(targetPath, file));
    }
  }

  console.log(chalk.gray(`Found ${files.length} files to check\n`));

  const results: TransformResult[] = [];
  let transformedCount = 0;

  for (const file of files) {
    const result = transformFile(file);
    results.push(result);
    
    if (result.transformed) {
      transformedCount++;
      console.log(chalk.green('✓'), chalk.white(result.file));
      for (const change of result.changes) {
        console.log(chalk.gray(`  ${change}`));
      }
    }
  }

  console.log('\n' + chalk.blue('═'.repeat(50)));
  console.log(chalk.green(`\n✅ Codemod complete!`));
  console.log(chalk.white(`   Files checked: ${files.length}`));
  console.log(chalk.white(`   Files updated: ${transformedCount}`));
  
  if (transformedCount > 0) {
    console.log(chalk.yellow('\n⚠️  Please review the changes and test your code'));
    console.log(chalk.gray('   All imports have been updated to use @keithk/deploy'));
  }
}

// Run if executed directly
if (import.meta.main) {
  const targetPath = process.argv[2] || process.cwd();
  await runCodemod(targetPath);
}

export { transformFile, runCodemod };