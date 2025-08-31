import type { SiteConfig } from "../core";
import { debug, info, error, warn } from "../../core";

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
  
  // Debug logging for site context
  console.log('🔍 siteContext debug:');
  console.log(`  - Total sites loaded: ${sites.length}`);
  console.log(`  - Default site: ${defaultSite ? `${defaultSite.subdomain} (${defaultSite.type})` : 'NONE'}`);
  sites.forEach((site, i) => {
    console.log(`  - Site ${i}: ${site.subdomain} (${site.type}) default=${site.default} path=${site.path}`);
  });

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
    console.log(`🌐 Request routing debug:`);
    console.log(`  - Host: ${hostNoPort}`);
    console.log(`  - Subdomain: '${subdomain}'`);

    // Find site by subdomain (default site if none)
    let site: SiteConfig | undefined;

    if (!subdomain) {
      site = defaultSite;
      console.log(`  - No subdomain, using default site: ${site ? `${site.subdomain} (${site.type})` : 'NONE'}`);
      debug(`Using default site for host: ${hostNoPort}`);
    } else {
      site = sites.find(
        (s) => (s.subdomain || s.route.replace(/^\//, "")) === subdomain
      );
      console.log(`  - Found site for subdomain '${subdomain}': ${site ? `${site.subdomain} (${site.type})` : 'NOT FOUND'}`);
      debug(
        `Site match for subdomain '${subdomain}':`,
        site ? site.path : "NOT FOUND"
      );
    }

    if (!site) {
      console.log(`  - ❌ No site found, returning 404`);
      return new Response("Site not found", { status: 404 });
    }

    console.log(`  - ✅ Selected site: ${site.subdomain} (${site.type}) at ${site.path}`);

    // Add the site to the context
    context.set("site", site);

    return site;
  };
}
