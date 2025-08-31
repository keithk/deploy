#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'fs';
import { Glob } from 'bun';
import { resolve } from 'path';

const rootDir = resolve(process.cwd());

async function fixAdminTypes() {
  const glob = new Glob('src/admin/routes/*.ts');
  const files = Array.from(glob.scanSync({ cwd: rootDir }));
  
  for (const file of files) {
    const filePath = resolve(rootDir, file);
    let content = readFileSync(filePath, 'utf-8');
    const original = content;
    
    // Fix c.get("user") type issues
    content = content.replace(/const user = c\.get\("user"\);/g, 'const user = c.get("user") as any;');
    content = content.replace(/const currentUser = c\.get\("user"\);/g, 'const currentUser = c.get("user") as any;');
    
    // Fix error.message type issues
    content = content.replace(/error\.message/g, '(error as Error).message');
    
    // Fix callback parameter types
    content = content.replace(/\.filter\(\(item\) =>/g, '.filter((item: any) =>');
    content = content.replace(/\.map\(\(project\) =>/g, '.map((project: any) =>');
    content = content.replace(/\.map\(\(file\) =>/g, '.map((file: any) =>');
    content = content.replace(/\.map\(\(dir\) =>/g, '.map((dir: any) =>');
    
    // Fix process union type issues  
    content = content.replace(/proc\.cwd \? resolve\(proc\.cwd\)/g, '"cwd" in proc ? resolve((proc as any).cwd)');
    content = content.replace(/proc\.site \|\| proc\.name/g, '"site" in proc ? (proc as any).site : "name" in proc ? (proc as any).name');
    content = content.replace(/proc\.type \|\| proc\.template/g, '"type" in proc ? (proc as any).type : "template" in proc ? (proc as any).template');
    content = content.replace(/proc\.cwd \|\| proc\.path/g, '"cwd" in proc ? (proc as any).cwd : "path" in proc ? (proc as any).path');
    content = content.replace(/site\.port/g, '(site as any).port');
    content = content.replace(/site\.domain/g, '(site as any).domain');
    content = content.replace(/site\.site/g, '(site as any).site');
    
    // Fix processDetails[key] indexing
    content = content.replace(/processDetails\[/g, '(processDetails as any)[');
    
    // Fix await callback types
    content = content.replace(/await stdoutData\(\(data\) =>/g, 'await stdoutData((data: any) =>');
    content = content.replace(/await stderrData\(\(data\) =>/g, 'await stderrData((data: any) =>');
    content = content.replace(/await onExit\(\(code\) =>/g, 'await onExit((code: any) =>');
    
    if (content !== original) {
      writeFileSync(filePath, content);
      console.log(`Fixed ${file}`);
    }
  }
}

async function main() {
  console.log('Fixing admin type errors...\n');
  await fixAdminTypes();
  console.log('\nDone!');
}

main().catch(console.error);