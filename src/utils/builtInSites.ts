import { resolve, join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';
import type { SiteConfig } from '../types';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Registry for built-in sites (admin, editor, etc.)
 * This allows built-in components to register themselves at runtime
 */
class BuiltInSitesRegistry {
  private sites: Map<string, SiteConfig> = new Map();

  /**
   * Register a built-in site configuration
   * @param site The site configuration to register
   */
  register(site: SiteConfig): void {
    if (!site.subdomain) {
      throw new Error('Built-in site must have a subdomain');
    }
    this.sites.set(site.subdomain, site);
  }

  /**
   * Get all registered built-in sites
   * @returns Array of registered site configurations
   */
  getAll(): SiteConfig[] {
    return Array.from(this.sites.values());
  }

  /**
   * Get a specific built-in site by subdomain
   * @param subdomain The subdomain to look up
   * @returns The site configuration or undefined
   */
  get(subdomain: string): SiteConfig | undefined {
    return this.sites.get(subdomain);
  }

  /**
   * Clear all registered sites
   */
  clear(): void {
    this.sites.clear();
  }
}

// Singleton instance
export const builtInSitesRegistry = new BuiltInSitesRegistry();

/**
 * Register a built-in site (convenience function)
 * @param site The site configuration to register
 */
export function registerBuiltInSite(site: SiteConfig): void {
  builtInSitesRegistry.register(site);
}

/**
 * Get all registered built-in sites from the registry
 * @returns Array of registered site configurations
 */
export function getRegisteredBuiltInSites(): SiteConfig[] {
  return builtInSitesRegistry.getAll();
}

/**
 * Discover and get built-in sites that should be included in site discovery
 * This includes dynamically checking for admin and editor panels
 */
export async function discoverBuiltInSites(): Promise<SiteConfig[]> {
  const builtInSites: SiteConfig[] = [];
  
  // Start with any registered sites
  builtInSites.push(...getRegisteredBuiltInSites());
  
  // Check if admin panel is enabled
  if (await isAdminEnabled()) {
    const adminSite = await createAdminSiteConfig();
    // Only add if not already registered
    if (!builtInSites.find(s => s.subdomain === adminSite.subdomain)) {
      builtInSites.push(adminSite);
    }
  }
  
  // Check if editor is enabled
  if (await isEditorEnabled()) {
    const editorSite = await createEditorSiteConfig();
    // Only add if not already registered
    if (!builtInSites.find(s => s.subdomain === editorSite.subdomain)) {
      builtInSites.push(editorSite);
    }
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
    console.warn('Failed to load admin site config:', error);
    return false;
  }
}

/**
 * Check if editor should be enabled
 */
async function isEditorEnabled(): Promise<boolean> {
  // Check environment variable
  if (process.env.EDITOR_DISABLED === 'true') {
    return false;
  }
  
  // Similar logic to admin
  const isInDist = __dirname.includes('/dist/');
  const editorPath = isInDist 
    ? resolve(__dirname, '../editor')
    : resolve(__dirname, '../../editor');
  
  const siteConfigPath = join(editorPath, 'site.json');
  
  if (!existsSync(siteConfigPath)) {
    return false;
  }
  
  try {
    const config = await Bun.file(siteConfigPath).json();
    return config.config?.enableByDefault !== false;
  } catch (error) {
    console.warn('Failed to load editor site config:', error);
    return false;
  }
}

/**
 * Create admin site configuration
 */
async function createAdminSiteConfig(): Promise<SiteConfig> {
  const isInDist = __dirname.includes('/dist/');
  const adminPath = isInDist 
    ? resolve(__dirname, '../admin')
    : resolve(__dirname, '../../admin');
  
  try {
    const siteConfigPath = join(adminPath, 'site.json');
    const config = await Bun.file(siteConfigPath).json();
    
    // Get the module URL for the admin panel
    const adminIndexPath = join(adminPath, 'index.ts');
    const adminModuleUrl = pathToFileURL(adminIndexPath).href;
    
    return {
      name: 'admin',
      type: 'built-in',
      path: adminPath,
      route: '',
      subdomain: config.subdomain || 'admin',
      config: config.config || {},
      domain: config.domain,
      isBuiltIn: true,
      module: () => import(adminModuleUrl)
    } as SiteConfig;
  } catch (error) {
    console.error('Failed to create admin site config:', error);
    throw error;
  }
}

/**
 * Create editor site configuration
 */
async function createEditorSiteConfig(): Promise<SiteConfig> {
  const isInDist = __dirname.includes('/dist/');
  const editorPath = isInDist 
    ? resolve(__dirname, '../editor')
    : resolve(__dirname, '../../editor');
  
  try {
    const siteConfigPath = join(editorPath, 'site.json');
    const config = await Bun.file(siteConfigPath).json();
    
    // Get the module URL for the editor
    const editorIndexPath = join(editorPath, 'index.ts');
    const editorModuleUrl = pathToFileURL(editorIndexPath).href;
    
    return {
      name: 'editor',
      type: 'built-in',
      path: editorPath,
      route: '',
      subdomain: config.subdomain || 'editor',
      config: config.config || {},
      domain: config.domain,
      isBuiltIn: true,
      module: () => import(editorModuleUrl)
    } as SiteConfig;
  } catch (error) {
    console.error('Failed to create editor site config:', error);
    throw error;
  }
}

// Backward compatibility exports
export const getBuiltInSites = discoverBuiltInSites;