
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
  # ACME settings and port configuration
  email ${process.env.EMAIL || "admin@" + domain}
  
  http_port 80
  https_port 443
  
  # Enable HTTP/3 support with fallback protocols
  servers {
    protocols h1 h2 h3
  }
  
  # On-demand TLS for SaaS applications (if enabled)
  ${process.env.ENABLE_ON_DEMAND_TLS === 'true' ? `on_demand_tls {
    ask http://localhost:3000/api/validate-domain
    interval 2m
    burst 5
  }` : ''}
  
  log {
    output file /var/log/caddy/access.log
    format json
  }
}

# Root domain configuration
${domain} {
  # Enable advanced compression
  encode {
    gzip 6
    br 6
    zstd
  }
  
  # Security headers
  header {
    # Remove server info
    -Server
    # XSS Protection
    X-Content-Type-Options nosniff
    X-Frame-Options DENY
    X-XSS-Protection "1; mode=block"
    # HSTS
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
  }
  
  # Proxy requests to DialUpDeploy server with health monitoring
  reverse_proxy localhost:3000 {
    health_uri /health
    health_interval 30s
    health_timeout 5s
    flush_interval -1
  }
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
  # Enable advanced compression
  encode {
    gzip 6
    br 6
    zstd
  }
  
  # Security headers
  header {
    -Server
    X-Content-Type-Options nosniff
    X-Frame-Options SAMEORIGIN
    X-XSS-Protection "1; mode=block"
  }
  
  # Proxy requests with forwarded headers for site routing
  reverse_proxy localhost:3000 {
    header_up Host {host}
    header_up X-Real-IP {remote}
    header_up X-Forwarded-For {remote}
    header_up X-Forwarded-Proto {scheme}
  }
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
  # Enable on-demand TLS if configured
  ${process.env.ENABLE_ON_DEMAND_TLS === 'true' ? 'tls {\n    on_demand\n  }' : ''}
  
  # Enable advanced compression
  encode {
    gzip 6
    br 6
    zstd
  }
  
  # Security headers for custom domains
  header {
    -Server
    X-Content-Type-Options nosniff
    X-Frame-Options SAMEORIGIN
    X-XSS-Protection "1; mode=block"
  }
  
  # Proxy requests with forwarded headers for site routing
  reverse_proxy localhost:3000 {
    header_up Host {host}
    header_up X-Real-IP {remote}
    header_up X-Forwarded-For {remote}
    header_up X-Forwarded-Proto {scheme}
  }
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
