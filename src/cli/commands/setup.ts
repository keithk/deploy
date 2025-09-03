
import { Command } from "commander";
import { join, resolve, dirname } from "path";
import { homedir } from "os";
import chalk from "chalk";
import {
  generateCaddyfileContent,
  discoverSites,
  type SiteConfig
} from "../../core";
import {
  isCaddyInstalled,
  isCaddyRunning,
  getDomain,
  getCaddyfilePath,
  startCaddy,
  stopCaddy,
  reloadCaddy
} from "../utils/caddy";
import {
  ensureDir,
  commandExists,
  execCommand,
  updateEnvFile,
  installDocker,
  installMise,
  installRailpacks,
  installCaddy,
  configureDnsmasq,
  trustLocalCerts,
  configureCaddy,
  configureCaddyProduction,
  createServiceFile,
  createStartupScript,
  createQuickSetupScript,
  configureFirewall,
  verifyDockerSetup,
  verifyInstallation,
  showPostInstallInstructions
} from "../utils/setup-utils";
import { setupDatabase } from "../utils/database-setup";

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m"
};

// Log functions
const log = {
  info: (message: string) =>
    console.log(`${colors.blue}[INFO]${colors.reset} ${message}`),
  success: (message: string) =>
    console.log(`${colors.green}[SUCCESS]${colors.reset} ${message}`),
  warning: (message: string) =>
    console.log(`${colors.yellow}[WARNING]${colors.reset} ${message}`),
  error: (message: string) =>
    console.log(`${colors.red}[ERROR]${colors.reset} ${message}`),
  step: (message: string) =>
    console.log(`\n${colors.cyan}==>${colors.reset} ${message}`)
};

// Platform detection
const platform = process.platform;
const isLinux = platform === "linux";
const isMac = platform === "darwin";

// Paths
const projectRoot = resolve(process.cwd());
const configDir = join(projectRoot, "config");

/**
 * Setup for local development environment
 */
async function setupLocal(
  options: { skipCaddy?: boolean } = {}
): Promise<boolean> {
  log.step("Starting local development setup...");

  // Get domain from .env or use default
  const domain = await getDomain();
  log.info(`Using domain: ${domain}`);

  // Update .env file with the domain
  await updateEnvFile(domain, projectRoot);

  // Initialize database and create admin user
  if (!(await setupDatabase(domain, log))) {
    log.error("Failed to set up database and admin user.");
    return false;
  }

  // Install all required dependencies
  log.step("Installing required dependencies...");
  
  // Install Docker first (required for containerization)
  if (!(await installDocker(log))) {
    log.warning("Docker installation failed or requires manual setup.");
    log.info("Deploy will still work for non-containerized deployments.");
  }
  
  // Install Mise (required by Railpacks)
  if (!(await installMise(log))) {
    log.warning("Mise installation failed. Railpacks may not work properly.");
  }
  
  // Install Railpacks (for automatic containerization)
  if (!(await installRailpacks(log))) {
    log.warning("Railpacks installation failed. Manual containerization will be required.");
  }
  
  // Install Caddy (for reverse proxy)
  if (!options.skipCaddy && !(await installCaddy(log))) {
    log.error("Failed to install Caddy.");
    return false;
  }

  // Platform-specific configurations
  let useHttps = false;

  if (isMac) {
    // Configure dnsmasq on macOS
    if (!(await configureDnsmasq(domain, log))) {
      log.warning(
        "Failed to configure dnsmasq. Local DNS resolution may not work properly."
      );
    }

    // Trust local certificates on macOS
    if (await trustLocalCerts(domain, configDir, log)) {
      useHttps = true;
      log.success(
        "HTTPS certificates set up successfully for local development!"
      );
    } else {
      log.warning(
        "Failed to trust local certificates. Falling back to HTTP for local development."
      );
      useHttps = false;
    }
  }

  // Configure Caddy (cross-platform)
  if (!(await configureCaddy(domain, projectRoot, configDir, useHttps, log))) {
    log.error("Failed to configure Caddy.");
    return false;
  }

  // Start Caddy server
  if (!options.skipCaddy && !(await startCaddy())) {
    log.error("Failed to start Caddy server.");
    return false;
  }

  // Verify installation
  if (await verifyInstallation(log)) {
    log.success("All tools are working correctly!");
  } else {
    log.warning("Some tools may need attention. Run 'deploy doctor' for details.");
  }
  
  // Show post-installation instructions
  await showPostInstallInstructions(domain, useHttps, log);
  
  return true;
}

/**
 * Setup for production environment
 */
async function setupProduction(
  options: { skipCaddy?: boolean } = {}
): Promise<boolean> {
  log.step("Starting production setup...");

  // Get domain from .env or prompt user
  const domain = await getDomain();
  log.info(`Using domain: ${domain}`);

  // Update .env file with the domain
  await updateEnvFile(domain, projectRoot);

  // Initialize database and create admin user
  if (!(await setupDatabase(domain, log))) {
    log.error("Failed to set up database and admin user.");
    return false;
  }

  // Create necessary directories
  await ensureDir(configDir);

  // Install all required dependencies for production
  log.step("Installing required dependencies...");
  
  // Install Docker (critical for production)
  if (!(await installDocker(log))) {
    log.error("Docker installation failed. Docker is required for production deployments.");
    return false;
  }
  
  // Install Mise (required by Railpacks)
  if (!(await installMise(log))) {
    log.warning("Mise installation failed. Railpacks may not work properly.");
  }
  
  // Install Railpacks (for automatic containerization)
  if (!(await installRailpacks(log))) {
    log.warning("Railpacks installation failed. Manual containerization will be required.");
  }
  
  // Install Caddy (for reverse proxy)
  if (!options.skipCaddy && !(await installCaddy(log))) {
    log.error("Failed to install Caddy. Please install it manually.");
    log.info("Continuing setup without Caddy...");
  }

  // Configure Caddy for production
  if (!(await configureCaddyProduction(domain, projectRoot, configDir, log))) {
    log.error("Failed to configure Caddy for production.");
    log.info("You can configure Caddy manually later if needed.");
  }

  // Create service file for systemd or other service managers
  if (!(await createServiceFile(domain, projectRoot, configDir, log))) {
    log.warning("Failed to create service file.");
  }

  // Create a manual startup script
  if (!(await createStartupScript(domain, projectRoot, configDir, log))) {
    log.warning("Failed to create startup script.");
  }

  // Create a quick setup script for new Ubuntu droplets
  if (!(await createQuickSetupScript(domain, projectRoot, log))) {
    log.warning("Failed to create quick setup script.");
  }

  // Configure firewall on Linux
  if (isLinux) {
    await configureFirewall(log);
  }

  log.step("Production setup completed!");
  log.info(`Your domain is configured as: ${domain}`);
  log.info(`Configuration files are in: ${configDir}`);
  log.info("");
  log.info("To start your application in production:");
  log.info(
    `1. Using the service (systemd): See ${join(
      configDir,
      "service-installation.txt"
    )}`
  );
  log.info(`2. Manually: Run ${join(projectRoot, "start.sh")}`);
  log.info("");
  log.info("DNS Configuration Reminder:");
  log.info(
    `1. Set up an A record for ${domain} pointing to your server's IP address`
  );
  log.info(
    `2. Set up a wildcard CNAME record (*.${domain}) pointing to your root domain`
  );

  // If using custom domains, provide additional DNS instructions
  try {
    const sites = await discoverSites(join(projectRoot, "sites"));
    const sitesWithCustomDomains = (sites as SiteConfig[]).filter(
      (site) => site.customDomain
    );

    if (sitesWithCustomDomains.length > 0) {
      log.info("");
      log.info("For your custom domains:");

      for (const site of sitesWithCustomDomains as SiteConfig[]) {
        if (site.customDomain) {
          log.info(
            `- Set up an A record for ${site.customDomain} pointing to your server's IP address`
          );
        }
      }
    }

    // List all subdomains that will be available
    log.info("");
    log.info("Your site will be available at the following URLs:");
    log.info(`- https://${domain} (main domain)`);

    for (const site of sites as SiteConfig[]) {
      const subdomain = site.subdomain || site.route?.replace(/^\//, "");
      if (subdomain) {
        log.info(`- https://${subdomain}.${domain} (${site.type} site)`);
      }
    }
  } catch (error) {
    // Ignore errors discovering sites
  }

  log.info("");
  log.info("For a new Ubuntu droplet, you can use the quick-setup.sh script");
  log.info("to set up everything in one go.");
  log.info("");
  log.info("Happy deploying!");

  return true;
}

/**
 * Main setup function
 */
async function setup(
  environment: string = "local",
  options: { skipCaddy?: boolean } = {}
): Promise<void> {
  try {
    log.step(`Starting ${environment} setup...`);
    log.info("This will install and configure all required dependencies.");
    
    if (environment === "production") {
      if (!(await setupProduction(options))) {
        log.error("Production setup failed.");
        log.info("Run 'deploy doctor' to diagnose issues.");
        process.exit(1);
      }
    } else {
      if (!(await setupLocal(options))) {
        log.error("Local development setup failed.");
        log.info("Run 'deploy doctor' to diagnose issues.");
        process.exit(1);
      }
    }
    
    log.success("Setup completed successfully! 🎉");
    log.info("You can now run 'bun run dev' to start developing.");
    process.exit(0);
  } catch (error) {
    log.error(
      `Setup failed: ${error instanceof Error ? error.message : String(error)}`
    );
    log.info("Run 'deploy doctor' to diagnose the issue.");
    process.exit(1);
  }
}

/**
 * Register the setup command
 */
export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Set up the project for local development or production")
    .argument(
      "[environment]",
      "Environment to set up (local or production)",
      "local"
    )
    .option("--skip-caddy", "Skip Caddy installation and configuration")
    .action(setup);
}
