
// Using internal imports
import { discoverSites } from "./siteDiscovery";
import type { SiteConfig } from "../types";

/**
 * Generate Caddyfile content based on domain and discovered sites
 * @param domain The primary domain for the server
 * @param sitesDir The directory containing site configurations
 * @param logger Optional logger functions for output
 * @returns The generated Caddyfile content as a string
 */
export async function generateCaddyfileContent(
  domain: string,
  sitesDir: string = "./sites",
  logger: {
    info?: (message: string) => void;
    warning?: (message: string) => void;
  } = {}
): Promise<string> {
  const log = {
    info: logger.info || console.log,
    warning: logger.warning || console.warn
  };

  log.info(`Generating Caddyfile content for domain: ${domain}...`);

  // Start with the base configuration
  let caddyfileContent = `{
  # Global Caddy settings
  email ${process.env.EMAIL || "admin@" + domain}
  
  # Use production optimizations
  http_port 80
  https_port 443
  
  # Log settings
  log {
    output file /var/log/caddy/access.log
    format json
  }
}

# Root domain configuration
${domain} {
  # Reverse proxy to your Bun server
  reverse_proxy localhost:3000
}

`;

  // Discover sites to create subdomain configurations
  log.info("Discovering sites to create subdomain configurations...");
  try {
    // Use "serve" mode to filter out underscore sites in production
    const sites = await discoverSites(sitesDir, "serve");

    if (sites.length > 0) {
      log.info(`Found ${sites.length} sites.`);

      // Add subdomain configurations to the Caddyfile
      caddyfileContent += "\n# Subdomain configurations\n";

      for (const site of sites as SiteConfig[]) {
        const subdomain = site.subdomain || site.route.replace(/^\//, "");
        log.info(`Adding configuration for subdomain: ${subdomain}.${domain}`);

        caddyfileContent += `\n${subdomain}.${domain} {
  # Reverse proxy to your Bun server
  reverse_proxy localhost:3000
}
`;
      }

      // Add custom domain configurations if any
      const sitesWithCustomDomains = (sites as SiteConfig[]).filter(
        (site) => site.customDomain
      );

      if (sitesWithCustomDomains.length > 0) {
        log.info(
          `Found ${sitesWithCustomDomains.length} sites with custom domains.`
        );

        caddyfileContent += "\n# Custom domain configurations\n";

        for (const site of sitesWithCustomDomains as SiteConfig[]) {
          if (site.customDomain) {
            log.info(
              `Adding configuration for custom domain: ${site.customDomain}`
            );
            caddyfileContent += `\n${site.customDomain} {
  # Reverse proxy to your Bun server
  reverse_proxy localhost:3000
}
`;
          }
        }
      }
    } else {
      log.info("No sites found.");
    }
  } catch (error) {
    log.warning(
      `Could not discover sites: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    log.info("Continuing with basic Caddyfile configuration.");
  }

  return caddyfileContent;
}
