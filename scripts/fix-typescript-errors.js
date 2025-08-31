#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'fs';
import { Glob } from 'bun';
import { resolve } from 'path';

const rootDir = resolve(process.cwd());

// Fix specific TypeScript errors
async function fixTypeScriptErrors() {
  const fixes = [
    // Fix command.ts 'part' possibly undefined
    {
      file: 'src/actions/utils/command.ts',
      fixes: [
        {
          find: `      if (part.startsWith('--')) {
        arg = part.slice(2);`,
          replace: `      if (part && part.startsWith('--')) {
        arg = part.slice(2);`
        },
        {
          find: `      } else if (part.startsWith('-')) {
        arg = part.slice(1);`,
          replace: `      } else if (part && part.startsWith('-')) {
        arg = part.slice(1);`
        }
      ]
    },
    // Fix admin routes session.get type issues
    {
      file: 'src/admin/routes/auth.ts',
      fixes: [
        {
          find: 'const userId = c.get("session").get("userId");',
          replace: 'const userId = c.get("session")?.get("userId");'
        }
      ]
    },
    // Fix admin dashboard/settings/users session type issues
    {
      file: 'src/admin/routes/dashboard.ts',
      fixes: [
        {
          find: '  const user = c.get("user");',
          replace: '  const user = c.get("user") as any;'
        }
      ]
    },
    {
      file: 'src/admin/routes/settings.ts',
      fixes: [
        {
          find: '  const user = c.get("user");',
          replace: '  const user = c.get("user") as any;'
        },
        {
          find: '        error: error.message',
          replace: '        error: (error as Error).message'
        }
      ]
    },
    {
      file: 'src/admin/routes/users.ts',
      fixes: [
        {
          find: '  const user = c.get("user");',
          replace: '  const user = c.get("user") as any;',
          all: true
        },
        {
          find: '  const currentUser = c.get("user");',
          replace: '  const currentUser = c.get("user") as any;',
          all: true
        },
        {
          find: '        error: error.message || "Failed to create user"',
          replace: '        error: (error as Error).message || "Failed to create user"'
        },
        {
          find: '      error: error.message || "Failed to fetch user details"',
          replace: '      error: (error as Error).message || "Failed to fetch user details"'
        },
        {
          find: '      error: error.message || "Failed to fetch user repositories"',
          replace: '      error: (error as Error).message || "Failed to fetch user repositories"'
        },
        {
          find: '    error: error.message || "Failed to fetch file contents"',
          replace: '    error: (error as Error).message || "Failed to fetch file contents"'
        },
        {
          find: '      error: error.message || "Failed to update file"',
          replace: '      error: (error as Error).message || "Failed to update file"'
        },
        {
          find: '      error: error.message',
          replace: '      error: (error as Error).message'
        },
        {
          find: '.filter((item) => item.type === "dir")',
          replace: '.filter((item: any) => item.type === "dir")'
        },
        {
          find: '.map((project) => ({',
          replace: '.map((project: any) => ({'
        },
        {
          find: '.filter((file) => !file.name.startsWith("."))',
          replace: '.filter((file: any) => !file.name.startsWith("."))'
        },
        {
          find: 'await stdoutData((data) => {',
          replace: 'await stdoutData((data: any) => {'
        },
        {
          find: 'await stderrData((data) => {',
          replace: 'await stderrData((data: any) => {'
        },
        {
          find: 'await onExit((code) => {',
          replace: 'await onExit((code: any) => {'
        },
        {
          find: 'processDetails[',
          replace: '(processDetails as any)['
        },
        {
          find: 'const siteStatus = usersToSites[userId]?.map((dir) => ({',
          replace: 'const siteStatus = usersToSites[userId]?.map((dir: any) => (({'
        },
        {
          find: '    isDirectory: dir.isDirectory,',
          replace: '    isDirectory: (dir as any).isDirectory,'
        }
      ]
    },
    // Fix process.ts
    {
      file: 'src/cli/commands/processes.ts',
      fixes: [
        {
          find: '    const lastLine = lines[lines.length - 1]?.split(" | ");',
          replace: '    const lastLine = lines[lines.length - 1]?.split(" | ");'
        },
        {
          find: '    if (lastLine.length >= 4) {',
          replace: '    if (lastLine && lastLine.length >= 4) {'
        }
      ]
    },
    // Fix admin users.ts union type issues
    {
      file: 'src/admin/routes/users.ts',
      fixes: [
        {
          find: '              path: proc.cwd ? resolve(proc.cwd) : "N/A",',
          replace: '              path: "cwd" in proc ? resolve((proc as any).cwd) : "path" in proc ? (proc as any).path : "N/A",'
        },
        {
          find: '              siteType: proc.site || proc.name || "Unknown",',
          replace: '              siteType: "site" in proc ? (proc as any).site : "name" in proc ? (proc as any).name : "Unknown",'
        },
        {
          find: '              projectType: proc.type || proc.template || "Custom",',
          replace: '              projectType: "type" in proc ? (proc as any).type : "template" in proc ? (proc as any).template : "Custom",'
        },
        {
          find: '              location: proc.cwd || proc.path || "N/A",',
          replace: '              location: "cwd" in proc ? (proc as any).cwd : "path" in proc ? (proc as any).path : "N/A",'
        },
        {
          find: '                      domain: `https://${site.port}.localhost.direct`,',
          replace: '                      domain: "port" in site ? `https://${(site as any).port}.localhost.direct` : `https://${(site as any).domain}`,'
        },
        {
          find: '                      domain: `https://${site.domain}`,',
          replace: '                      domain: "domain" in site ? `https://${(site as any).domain}` : `http://localhost:${(site as any).port}`,'
        },
        {
          find: '            message: `Would restart ${site.site || site.domain}`,',
          replace: '            message: `Would restart ${"site" in site ? (site as any).site : (site as any).domain}`,'
        }
      ]
    },
    // Fix server api handlers
    {
      file: 'src/server/api/handlers.ts',
      fixes: [
        {
          find: '  const envContent = readFileSync(envFile, "utf-8");',
          replace: '  const envContent = envFile ? readFileSync(envFile, "utf-8") : "";'
        },
        {
          find: '    const response = await fetch(ghUrl);',
          replace: '    const response = await fetch(ghUrl!);'
        },
        {
          find: '  const response = await fetch(ghUrl);',
          replace: '  const response = await fetch(ghUrl!);'
        },
        {
          find: '  const tarballUrl = latestRelease.tarball_url;',
          replace: '  const tarballUrl = latestRelease?.tarball_url;'
        },
        {
          find: '  const tarResponse = await fetch(tarballUrl);',
          replace: '  const tarResponse = await fetch(tarballUrl!);'
        }
      ]
    },
    // Fix container-manager
    {
      file: 'src/server/services/container-manager.ts',
      fixes: [
        {
          find: '      if (ports.length > 0) {',
          replace: '      if (ports && ports.length > 0) {'
        },
        {
          find: '        const port = parseInt(ports[0].PrivatePort);',
          replace: '        const port = parseInt(ports[0]?.PrivatePort || "0");'
        },
        {
          find: '      const port = parseInt(match[1]);',
          replace: '      const port = parseInt(match?.[1] || "0");'
        },
        {
          find: '      if (!name.startsWith("dialup-")) {',
          replace: '      if (name && !name.startsWith("dialup-")) {'
        },
        {
          find: '        timeout: 5000',
          replace: '        // timeout: 5000'
        }
      ]
    },
    // Fix git-manager
    {
      file: 'src/server/services/git-manager.ts',
      fixes: [
        {
          find: '        name: name.trim(),',
          replace: '        name: name?.trim() || "",'
        },
        {
          find: '        current: current.trim() === "*",',
          replace: '        current: current?.trim() === "*",'
        },
        {
          find: '        commit: commit.trim() || null,',
          replace: '        commit: commit?.trim() || null,'
        },
        {
          find: '        date: dateStr ? dateStr.trim() : null',
          replace: '        date: dateStr ? dateStr.trim() : null'
        },
        {
          find: '        hash: hash.trim(),',
          replace: '        hash: hash?.trim() || "",'
        },
        {
          find: '        message: message.trim(),',
          replace: '        message: message?.trim() || "",'
        },
        {
          find: '        author: author.trim(),',
          replace: '        author: author?.trim() || "",'
        },
        {
          find: '        date: new Date(dateStr.trim())',
          replace: '        date: new Date(dateStr?.trim() || "")'
        }
      ]
    },
    // Fix server utils index
    {
      file: 'src/server/utils/index.ts',
      fixes: [
        {
          find: '      cache[key] = value;',
          replace: '      if (key) cache[key] = value;'
        }
      ]
    },
    // Fix process-manager
    {
      file: 'src/server/utils/process-manager.ts',
      fixes: [
        {
          find: '      const siteConfig = this.siteManager.getSiteConfig(site);',
          replace: '      const siteConfig = this.siteManager?.getSiteConfig(site);'
        },
        {
          find: '        const buildCommand = buildConfig.command;',
          replace: '        const buildCommand = buildConfig?.command;'
        },
        {
          find: '        const buildCwd = buildConfig.workingDirectory || cwd;',
          replace: '        const buildCwd = buildConfig?.workingDirectory || cwd;'
        }
      ]
    },
    // Fix webhook middleware
    {
      file: 'src/server/middleware/webhook.ts',
      fixes: [
        {
          find: '      .sort((a, b) => a.priority - b.priority)',
          replace: '      .sort((a: any, b: any) => a.priority - b.priority)'
        },
        {
          find: '    for (const action of actions) {',
          replace: '    for (const action of actions as any[]) {'
        },
        {
          find: '      .filter((a) => a.executeOn === timing)',
          replace: '      .filter((a: any) => a.executeOn === timing)'
        }
      ]
    }
  ];

  for (const fileConfig of fixes) {
    const filePath = resolve(rootDir, fileConfig.file);
    try {
      let content = readFileSync(filePath, 'utf-8');
      const original = content;
      
      for (const fix of fileConfig.fixes) {
        if (fix.all) {
          content = content.replaceAll(fix.find, fix.replace);
        } else {
          content = content.replace(fix.find, fix.replace);
        }
      }
      
      if (content !== original) {
        writeFileSync(filePath, content);
        console.log(`Fixed ${fileConfig.file}`);
      }
    } catch (err) {
      console.warn(`Could not fix ${fileConfig.file}:`, err.message);
    }
  }
}

async function main() {
  console.log('Fixing TypeScript errors...\n');
  await fixTypeScriptErrors();
  console.log('\nDone!');
}

main().catch(console.error);