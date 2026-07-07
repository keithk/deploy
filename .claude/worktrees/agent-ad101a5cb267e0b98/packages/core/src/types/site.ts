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
 */
export interface SiteConfig {
  type: "static" | "dynamic" | "passthrough" | "static-build";
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
}
