import { resolve, join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';
import type { SiteConfig } from '@keithk/deploy-core';

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
  // In development: resolve from src/utils to src/admin
  // In production: the admin files should be included in the dist build
  const adminPath = resolve(__dirname, '../admin');
  const srcAdminPath = resolve(__dirname, '../src/admin'); // Corrected path for dev mode
  
  const siteConfigPath = existsSync(join(adminPath, 'site.json')) 
    ? join(adminPath, 'site.json')
    : join(srcAdminPath, 'site.json');
  
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
  const adminPath = resolve(__dirname, '../admin');
  const srcAdminPath = resolve(__dirname, '../src/admin'); // Corrected path for dev mode
  const finalAdminPath = existsSync(join(adminPath, 'site.json')) ? adminPath : srcAdminPath;
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
      const adminIndexPath = join(finalAdminPath, 'index.ts');
      const fileUrl = pathToFileURL(adminIndexPath).href;
      return import(fileUrl);
    },
  } as SiteConfig;
}