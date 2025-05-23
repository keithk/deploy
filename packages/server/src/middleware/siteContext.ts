import type { SiteConfig } from "@keithk/deploy-core";
import { debug, info, error, warn } from "@keithk/deploy-core";

/**
 * Middleware that determines the site based on the subdomain or custom domain.
 *
 * @param sites Array of site configurations
 * @param projectDomain The project domain (e.g., 'flexi')
 * @returns A function that processes the request and returns the site or a not found response
 */
export function siteContext(sites: SiteConfig[], projectDomain: string) {
  // Find the default site (if any)
  const defaultSite = sites.find((site) => site.default);

  return async (
    request: Request,
    context: Map<string, any>
  ): Promise<SiteConfig | Response> => {
    const host = request.headers.get("host") || "";
    let subdomain = "";

    // Remove port if present
    const hostNoPort = host.split(":")[0] || "";

    // First, check if this is a custom domain
    const siteByCustomDomain = sites.find(
      (site) => site.customDomain === hostNoPort
    );

    if (siteByCustomDomain) {
      debug(
        `Host: ${hostNoPort}, Matched custom domain for site: ${siteByCustomDomain.path}`
      );
      context.set("site", siteByCustomDomain);
      return siteByCustomDomain;
    }

    // Robust subdomain extraction logic
    // e.g. blog.dev.flexi, static-site-1.dev.flexi, dev.flexi, localhost
    if (hostNoPort === projectDomain || hostNoPort === `localhost`) {
      subdomain = "";
    } else {
      const hostLabels = hostNoPort.split(".");
      const domainLabels = projectDomain.split(".");
      debug(
        `hostLabels: ${JSON.stringify(
          hostLabels
        )}, domainLabels: ${JSON.stringify(domainLabels)}`
      );
      // Check if host ends with projectDomain
      const isDomainMatch =
        domainLabels.length <= hostLabels.length &&
        domainLabels.every(
          (label, i) =>
            label === hostLabels[hostLabels.length - domainLabels.length + i]
        );
      if (isDomainMatch) {
        const subdomainLabels = hostLabels.slice(
          0,
          hostLabels.length - domainLabels.length
        );
        subdomain = subdomainLabels.join(".");
      } else {
        subdomain = "";
      }
    }

    debug(`Host: ${hostNoPort}, Extracted subdomain: '${subdomain}'`);

    // Find site by subdomain (default site if none)
    let site: SiteConfig | undefined;

    if (!subdomain) {
      site = defaultSite;
      debug(`Using default site for host: ${hostNoPort}`);
    } else {
      site = sites.find(
        (s) => (s.subdomain || s.route.replace(/^\//, "")) === subdomain
      );
      debug(
        `Site match for subdomain '${subdomain}':`,
        site ? site.path : "NOT FOUND"
      );
    }

    if (!site) {
      return new Response("Site not found", { status: 404 });
    }

    // Add the site to the context
    context.set("site", site);

    return site;
  };
}
