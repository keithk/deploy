import { resolve, join } from 'path';
import { existsSync } from 'fs';
import type { SiteConfig } from '@keithk/deploy-core';

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
  const adminPath = resolve(__dirname, '../admin');
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
  const adminPath = resolve(__dirname, '../admin');
  const siteConfigPath = join(adminPath, 'site.json');
  
  // Load site configuration
  let siteConfig: any = {};
  if (existsSync(siteConfigPath)) {
    try {
      siteConfig = await Bun.file(siteConfigPath).json();
    } catch (error) {
      console.warn('Error reading admin site config, using defaults:', error);
    }
  }
  
  return {
    name: siteConfig.name || 'admin',
    subdomain: siteConfig.subdomain || 'admin',
    type: 'built-in',
    path: adminPath,
    domain: `admin.${process.env.PROJECT_DOMAIN || 'localhost'}`,
    config: {
      main: siteConfig.main || 'index.ts',
      scripts: siteConfig.scripts || {},
      ...siteConfig.config,
    },
    // Built-in specific properties
    isBuiltIn: true,
    module: () => import('../admin/index.js'),
  } as SiteConfig & { isBuiltIn: boolean; module: () => Promise<any> };
}