/**
 * Represents the configuration for a site served by the host.
 *
 * @property type        The type of site: static, dynamic, passthrough, or static-build.
 * @property path        The absolute path to the site directory.
 * @property route       The route at which the site is mounted.
 * @property entryPoint  Optional entry point file (for dynamic sites).
 * @property commands    Optional map of build/dev/start commands (from config or package.json).
 * @property proxyPort   Optional port to proxy to for passthrough/dev sites.
 * @property buildDir    Optional build output directory for static-build sites.
 * @property devPort     Optional dev server port for static-build sites.
 * @property subdomain   The subdomain for this site (e.g., 'blog', 'neopets-fan-page').
 *                       If not specified, defaults to the site directory name.
 * @property customDomain Optional custom domain for this site (e.g., 'mycustomdomain.com').
 *                       If specified, the site will be served at this domain in addition to its subdomain.
 * @property default     Whether this site is the default site that will be served at the root domain.
 *                       Only one site should be marked as default.
 * @property bskyDid     Optional Bluesky atproto DID for this site. If specified, the site will serve
 *                       this DID at the /.well-known/atproto-did path.
 * @property framework   Detected or configured framework (e.g., 'astro', 'nextjs', 'vite').
 * @property useContainers  Whether to use container-based deployment for this site. Defaults to true
 *                       for passthrough and dynamic sites, false for static and built-in sites.
 * @property dockerFile   Path to Dockerfile (for docker type sites).
 * @property dockerContext Directory to use as Docker build context (for docker type sites).
 * @property exposedPort  Port that the containerized app exposes (for docker type sites).
 */
export interface SiteConfig {
  type: "static" | "dynamic" | "passthrough" | "static-build" | "built-in" | "docker";
  path: string;
  route: string;
  entryPoint?: string;
  commands?: Record<string, string>;
  proxyPort?: number;
  buildDir?: string;
  devPort?: number;
  subdomain: string;
  customDomain?: string;
  default?: boolean;
  bskyDid?: string;
  framework?: string;
  useContainers?: boolean;
  // Docker site properties
  dockerFile?: string;
  dockerContext?: string;
  exposedPort?: number;
  environment?: Record<string, string>;
  // Git integration properties
  gitBranch?: string;
  gitCloneUrl?: string;
  // Built-in site properties
  name?: string;
  config?: Record<string, any>;
  domain?: string;
  isBuiltIn?: boolean;
  module?: () => Promise<any>;
}
