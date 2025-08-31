import { resolve, join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';
import type { SiteConfig } from '../../core';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get built-in sites that should be included in site discovery
 */
export async function getBuiltInSites(): Promise<SiteConfig[]> {
  const builtInSites: SiteConfig[] = [];
  
  // Check if admin panel is enabled
  if (await isAdminEnabled()) {
    const adminSite = await createAdminSiteConfig();
    builtInSites.push(adminSite);
  }
  
  return builtInSites;
}

/**
 * Check if admin panel should be enabled
 */
async function isAdminEnabled(): Promise<boolean> {
  // Check environment variable
  if (process.env.ADMIN_DISABLED === 'true') {
    return false;
  }
  
  // Check if site.json exists and is configured
  // In production (dist): resolve to dist/admin
  // In development (src): resolve to src/admin
  const isInDist = __dirname.includes('/dist/');
  const adminPath = isInDist 
    ? resolve(__dirname, '../admin')
    : resolve(__dirname, '../../admin');
  
  const siteConfigPath = join(adminPath, 'site.json');
  
  if (!existsSync(siteConfigPath)) {
    return false;
  }
  
  try {
    const config = await Bun.file(siteConfigPath).json();
    return config.config?.enableByDefault !== false;
  } catch (error) {
    console.warn('Error reading admin site config:', error);
    return true; // Default to enabled if config is malformed
  }
}

/**
 * Create site configuration for admin panel
 */
async function createAdminSiteConfig(): Promise<SiteConfig> {
  // Use same path resolution logic as isAdminEnabled
  const isInDist = __dirname.includes('/dist/');
  const finalAdminPath = isInDist 
    ? resolve(__dirname, '../admin')
    : resolve(__dirname, '../../admin');
  const siteConfigPath = join(finalAdminPath, 'site.json');
  
  // Load site configuration
  let siteConfig: any = {};
  if (existsSync(siteConfigPath)) {
    try {
      siteConfig = await Bun.file(siteConfigPath).json();
    } catch (error) {
      console.warn('Error reading admin site config, using defaults:', error);
    }
  }
  
  // Get current domain from environment
  const domain = process.env.PROJECT_DOMAIN || 'dev.deploy';
  
  return {
    name: siteConfig.name || 'admin',
    subdomain: siteConfig.subdomain || 'admin', 
    type: 'built-in',
    path: finalAdminPath,
    route: '/admin',
    domain: `admin.${domain}`,
    config: {
      main: siteConfig.main || 'index.ts',
      scripts: siteConfig.scripts || {},
      ...siteConfig.config,
    },
    // Built-in specific properties
    isBuiltIn: true,
    module: () => {
      // In production, use the compiled JS file
      const isDev = process.env.NODE_ENV === 'development' || !existsSync(join(finalAdminPath, 'index.js'));
      const adminIndexPath = join(finalAdminPath, isDev ? 'index.ts' : 'index.js');
      const fileUrl = pathToFileURL(adminIndexPath).href;
      return import(fileUrl);
    },
  } as SiteConfig;
}