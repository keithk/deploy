import { registerBuiltInSite } from '../core';
import { getBuiltInSites } from '@cli/utils/built-in-sites';

/**
 * Register admin panel as a built-in site
 */
export async function registerAdminSite(): Promise<void> {
  try {
    const builtInSites = await getBuiltInSites();
    
    // Register each built-in site (currently just admin)
    for (const site of builtInSites) {
      registerBuiltInSite(site);
    }
  } catch (error) {
    console.warn('⚠️ Failed to register built-in sites:', error);
  }
}