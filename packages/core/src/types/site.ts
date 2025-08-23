/**
 * Represents the configuration for a site served by the host.
 *
 * @property type        The type of site: static, dynamic, passthrough, static-build, or docker.
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
 * @property docker      Optional Docker-specific configuration for docker sites.
 */
export interface SiteConfig {
  type: "static" | "dynamic" | "passthrough" | "static-build" | "docker";
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
  docker?: DockerConfig;
}

/**
 * Docker-specific configuration for containerized sites
 */
export interface DockerConfig {
  /** Custom Dockerfile path (relative to site directory) */
  dockerfile?: string;
  /** Port that the container exposes internally */
  containerPort?: number;
  /** Environment variables to pass to the container */
  environment?: Record<string, string>;
  /** Volume mounts for the container */
  volumes?: Array<{
    host: string;
    container: string;
    readOnly?: boolean;
  }>;
  /** Build arguments for Docker build */
  buildArgs?: Record<string, string>;
  /** Docker image tag (defaults to site name) */
  imageTag?: string;
  /** Whether to always rebuild the image (useful in dev mode) */
  alwaysRebuild?: boolean;
}
