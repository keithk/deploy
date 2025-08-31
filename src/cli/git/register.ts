import { builtInSitesRegistry } from "../../core";
import type { SiteConfig } from "../core";

/**
 * Register the built-in git service site (Gogs)
 * This creates a subdomain configuration for git.{domain}
 */
export async function registerGitSite(): Promise<void> {
  // Check if git service is disabled via environment variable
  const isDisabled = process.env.GIT_SERVICE_DISABLED === 'true';
  
  if (isDisabled) {
    console.log('Git service site is disabled via GIT_SERVICE_DISABLED environment variable');
    return;
  }

  // The git service is a proxy to Gogs, not a file-based site
  // We use passthrough type to indicate it proxies to another service
  const gitSite: SiteConfig = {
    name: 'git',
    type: 'passthrough',
    subdomain: 'git',
    path: '/dev/null', // Not file-based, just needs a placeholder
    route: '/git',
    proxyPort: 3010, // Gogs runs on port 3010
    isBuiltIn: true,
    // No module since this is a proxy to Gogs, not a Hono app
  };

  builtInSitesRegistry.register(gitSite);
  console.log('Registered built-in git service site at git.{domain}');
}