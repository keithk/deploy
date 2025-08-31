import { builtInSitesRegistry } from '../../core';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';

/**
 * Register built-in sites (admin and editor)
 * This handles both development and production environments
 */
export async function registerBuiltInSites(): Promise<void> {
  // When bundled, we need to find the project root differently
  // The bundled CLI is at dist/cli/index.js
  // We need to find dist/admin and dist/editor
  
  // Start from current working directory, which should be the project root
  const projectRoot = process.cwd();
  
  // Check if we're running from dist (production/built) or src (development)
  // When built, __filename will be in dist/cli/utils/
  const isProduction = __filename.includes('/dist/');
  
  console.log('registerBuiltInSites: __filename =', __filename);
  console.log('registerBuiltInSites: isProduction =', isProduction);
  console.log('registerBuiltInSites: projectRoot =', projectRoot);
  
  // Admin site paths
  const adminPath = isProduction
    ? resolve(projectRoot, 'dist/admin')
    : resolve(projectRoot, 'src/admin');
  
  // Editor site paths  
  const editorPath = isProduction
    ? resolve(projectRoot, 'dist/editor')
    : resolve(projectRoot, 'src/editor');
  
  console.log('registerBuiltInSites: adminPath =', adminPath);
  console.log('registerBuiltInSites: editorPath =', editorPath);
  
  // Register admin site if it exists
  if (existsSync(adminPath)) {
    const adminIndexFile = isProduction ? 'index.js' : 'index.ts';
    const adminIndexPath = resolve(adminPath, adminIndexFile);
    
    console.log('registerBuiltInSites: adminIndexPath =', adminIndexPath);
    console.log('registerBuiltInSites: adminIndexPath exists =', existsSync(adminIndexPath));
    
    if (existsSync(adminIndexPath)) {
      builtInSitesRegistry.register({
        name: 'admin',
        type: 'built-in',
        subdomain: 'admin',
        path: adminPath,
        route: '/admin',
        isBuiltIn: true,
        module: () => import(pathToFileURL(adminIndexPath).href)
      });
      console.log('Registered built-in admin site at admin.{domain}');
    } else {
      console.log('registerBuiltInSites: Admin index file not found at', adminIndexPath);
    }
  } else {
    console.log('registerBuiltInSites: Admin path not found at', adminPath);
  }
  
  // Register editor site if it exists
  if (existsSync(editorPath)) {
    const editorIndexFile = isProduction ? 'index.js' : 'index.ts';
    const editorIndexPath = resolve(editorPath, editorIndexFile);
    
    console.log('registerBuiltInSites: editorIndexPath =', editorIndexPath);
    console.log('registerBuiltInSites: editorIndexPath exists =', existsSync(editorIndexPath));
    
    if (existsSync(editorIndexPath)) {
      builtInSitesRegistry.register({
        name: 'editor',
        type: 'built-in',
        subdomain: 'editor',
        path: editorPath,
        route: '/editor',
        isBuiltIn: true,
        module: () => import(pathToFileURL(editorIndexPath).href)
      });
      console.log('Registered built-in editor site at editor.{domain}');
    } else {
      console.log('registerBuiltInSites: Editor index file not found at', editorIndexPath);
    }
  } else {
    console.log('registerBuiltInSites: Editor path not found at', editorPath);
  }
}