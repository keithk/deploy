import type { SiteConfig } from "../types";

/**
 * Registry for built-in sites that can be populated by other packages
 */
class BuiltInSitesRegistry {
  private sites: SiteConfig[] = [];
  
  /**
   * Register a built-in site
   */
  register(site: SiteConfig): void {
    // Remove existing site with same subdomain if it exists
    this.sites = this.sites.filter(s => s.subdomain !== site.subdomain);
    this.sites.push(site);
  }
  
  /**
   * Unregister a built-in site
   */
  unregister(subdomain: string): void {
    this.sites = this.sites.filter(s => s.subdomain !== subdomain);
  }
  
  /**
   * Get all registered built-in sites
   */
  getAll(): SiteConfig[] {
    return [...this.sites];
  }
  
  /**
   * Clear all registered sites
   */
  clear(): void {
    this.sites = [];
  }
  
  /**
   * Get a site by subdomain
   */
  get(subdomain: string): SiteConfig | undefined {
    return this.sites.find(s => s.subdomain === subdomain);
  }
}

// Global registry instance
export const builtInSitesRegistry = new BuiltInSitesRegistry();

/**
 * Convenience function to register a built-in site
 */
export function registerBuiltInSite(site: SiteConfig): void {
  builtInSitesRegistry.register(site);
}

/**
 * Get all built-in sites from the registry
 */
export function getBuiltInSites(): SiteConfig[] {
  return builtInSitesRegistry.getAll();
}