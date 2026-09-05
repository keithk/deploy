// ABOUTME: Identifies hosts that serve the control plane rather than a deployed site.
// ABOUTME: These have no site record, so on-demand TLS must approve them explicitly.

/**
 * Subdomains that belong to the control plane itself. They never appear in the
 * site list, so domain validation has to recognize them by name.
 */
// `www` is an alias of the root domain and is served by the primary site.
export const RESERVED_SUBDOMAINS = ["admin", "deploy", "www"] as const;

/**
 * Reports whether a host is a control-plane subdomain of the project domain.
 */
export function isReservedHost(domain: string, projectDomain: string): boolean {
  const host = domain.toLowerCase();
  const root = projectDomain.toLowerCase();

  return RESERVED_SUBDOMAINS.some(subdomain => host === `${subdomain}.${root}`);
}
