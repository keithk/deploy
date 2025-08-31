
import { Command } from "commander";
import { resolve, join } from "path";
import chalk from "chalk";
import { generateCaddyfileContent } from "@keithk/deploy-core";
import { execCommand, ensureDir } from "../utils/setup-utils";

// Import CaddyManager for dynamic route management
import { CaddyManager } from "@keithk/deploy-server/dist/services/caddy-manager";

// Log functions using chalk
const log = {
  info: (message: string) => console.log(chalk.blue(`[INFO] `) + message),
  success: (message: string) =>
    console.log(chalk.green(`[SUCCESS] `) + message),
  warning: (message: string) =>
    console.log(chalk.yellow(`[WARNING] `) + message),
  error: (message: string) => console.log(chalk.red(`[ERROR] `) + message),
  step: (message: string) => console.log(`\n${chalk.cyan("==> ")}${message}`)
};

// Check if systemd is available
async function hasSystemd(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", "systemctl"], {
      stdio: ["ignore", "ignore", "ignore"]
    });
    return (await proc.exited) === 0;
  } catch (error) {
    return false;
  }
}

// Update Caddyfile command
async function updateCaddyfile(
  options: { rootDir?: string } = {}
): Promise<boolean> {
  log.step("Updating Caddyfile with current domain settings...");

  // Get domain from .env
  const domain = process.env.PROJECT_DOMAIN;
  if (!domain) {
    log.error("PROJECT_DOMAIN not found in .env file.");
    log.info("Please set PROJECT_DOMAIN in your .env file first.");
    return false;
  }

  // Generate the Caddyfile content using the shared utility
  const rootDir = options.rootDir || process.env.ROOT_DIR || "./sites";
  const caddyfileContent = await generateCaddyfileContent(domain, rootDir, {
    info: log.info,
    warning: log.warning
  });

  // Check if systemd is available
  if (!(await hasSystemd())) {
    log.warning("systemd is not available in this environment.");
    log.info(
      "Creating a Caddyfile for reference, but you'll need to configure Caddy manually."
    );

    // Write the Caddyfile locally for reference
    const localOutputPath = resolve("Caddyfile.production");
    await Bun.write(localOutputPath, caddyfileContent);
    log.success(`Caddyfile created at ${localOutputPath} for reference.`);

    log.info("To use this Caddyfile:");
    log.info("1. Copy this file to /etc/caddy/Caddyfile on your server");
    log.info(
      "2. Reload Caddy with: caddy reload --config /etc/caddy/Caddyfile"
    );

    return true;
  }

  // If systemd is available, proceed with normal setup
  const caddyfilePath = "/etc/caddy/Caddyfile";

  try {
    // Write the updated Caddyfile
    log.info(`Writing Caddyfile to ${caddyfilePath}...`);
    await ensureDir("/etc/caddy");

    // Write content to a temporary file first
    const tempFile = `/tmp/caddy-${Date.now()}.conf`;
    await Bun.write(tempFile, caddyfileContent);

    // Use sudo to move the file to the final location
    await execCommand("sudo", ["cp", tempFile, caddyfilePath], {}, log);
    await execCommand("rm", [tempFile], {}, log);

    // Set proper permissions
    await execCommand("sudo", ["chown", "root:root", caddyfilePath], {}, log);
    await execCommand("sudo", ["chmod", "644", caddyfilePath], {}, log);

    // Reload Caddy
    log.info("Reloading Caddy...");
    await execCommand("sudo", ["systemctl", "reload", "caddy"], {}, log);

    log.success("Caddy configuration updated successfully.");
    log.info(
      `Your sites should now be accessible at https://${domain} and subdomains.`
    );

    return true;
  } catch (error) {
    log.error(
      `Failed to update Caddy configuration: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

// Register the caddyfile commands
export function registerCaddyfileCommands(program: Command): void {
  const caddyfileCommand = program
    .command("caddyfile")
    .description("Manage Caddy configuration");

  caddyfileCommand
    .command("update")
    .description("Update Caddyfile with current domain settings")
    .option("-r, --root-dir <dir>", "Set the root sites directory")
    .action(async (options) => {
      try {
        if (await updateCaddyfile(options)) {
          log.success("Caddyfile updated successfully.");
          process.exit(0);
        } else {
          log.error("Failed to update Caddyfile.");
          process.exit(1);
        }
      } catch (error) {
        log.error(
          `Error updating Caddyfile: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        process.exit(1);
      }
    });

  caddyfileCommand
    .command("configure")
    .description("Configure advanced Caddy features")
    .option("--enable-http3", "Enable HTTP/3 support")
    .option("--enable-on-demand-tls", "Enable on-demand TLS for SaaS applications")
    .option("--disable-http3", "Disable HTTP/3 support")
    .option("--disable-on-demand-tls", "Disable on-demand TLS")
    .action(async (options) => {
      try {
        log.step("Configuring advanced Caddy features...");
        
        if (options.enableHttp3) {
          log.info("HTTP/3 is enabled by default in the new configuration.");
          log.info("No additional configuration needed.");
        }
        
        if (options.enableOnDemandTls) {
          log.info("Enabling on-demand TLS...");
          log.info("Add ENABLE_ON_DEMAND_TLS=true to your .env file");
          log.warning("Ensure your domain validation endpoint is secure!");
        }
        
        if (options.disableHttp3) {
          log.warning("HTTP/3 provides significant performance benefits.");
          log.info("To disable, modify the Caddyfile manually and remove 'h3' from protocols.");
        }
        
        if (options.disableOnDemandTls) {
          log.info("To disable on-demand TLS, remove ENABLE_ON_DEMAND_TLS from .env file");
        }
        
        log.info("\nAdvanced features configured:");
        log.info("• HTTP/3: Enabled by default for better performance");
        log.info("• Brotli & Zstd compression: Enabled for smaller transfers");
        log.info("• Security headers: Configured for XSS and clickjacking protection");
        log.info("• Health checks: Enabled for reverse proxy monitoring");
        log.info(`• On-demand TLS: ${process.env.ENABLE_ON_DEMAND_TLS === 'true' ? 'Enabled' : 'Disabled'}`);
        
        log.step("Run 'deploy caddyfile update' to apply changes");
        
      } catch (error) {
        log.error(`Configuration error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  caddyfileCommand
    .command("show")
    .description("Show the current Caddyfile content")
    .action(async () => {
      try {
        const domain = process.env.PROJECT_DOMAIN;
        if (!domain) {
          log.error("PROJECT_DOMAIN not found in .env file.");
          log.info("Please set PROJECT_DOMAIN in your .env file first.");
          process.exit(1);
        }

        const caddyfileContent = await generateCaddyfileContent(
          domain,
          "./sites",
          {
            info: log.info,
            warning: log.warning
          }
        );
        console.log("\n" + chalk.cyan("Current Caddyfile content:") + "\n");
        console.log(caddyfileContent);
        process.exit(0);
      } catch (error) {
        log.error(
          `Error showing Caddyfile: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        process.exit(1);
      }
    });

  // Dynamic routes management commands
  caddyfileCommand
    .command("routes")
    .description("Manage dynamic preview routes")
    .option("--list", "List all active dynamic routes")
    .option("--cleanup", "Clean up expired routes")
    .option("--reload", "Reload Caddy configuration")
    .action(async (options) => {
      try {
        const caddyManager = CaddyManager.getInstance();

        if (options.list) {
          log.step("Listing active dynamic routes...");
          const routes = caddyManager.getDynamicRoutes();
          
          if (routes.length === 0) {
            log.info("No active dynamic routes found.");
          } else {
            console.log(chalk.cyan("\nActive Dynamic Routes:"));
            console.log(chalk.gray("─".repeat(80)));
            
            for (const route of routes) {
              console.log(`${chalk.green("●")} ${chalk.bold(route.subdomain)}`);
              console.log(`   ${chalk.gray("Session:")} ${route.sessionId}`);
              console.log(`   ${chalk.gray("Site:")} ${route.siteName}`);
              console.log(`   ${chalk.gray("Target:")} localhost:${route.targetPort}`);
              console.log(`   ${chalk.gray("Created:")} ${route.createdAt.toLocaleString()}`);
              console.log("");
            }
          }
        }

        if (options.cleanup) {
          log.step("Cleaning up expired routes...");
          const cleanedUp = await caddyManager.cleanupExpiredRoutes();
          
          if (cleanedUp > 0) {
            log.success(`Cleaned up ${cleanedUp} expired routes.`);
          } else {
            log.info("No expired routes found.");
          }
        }

        if (options.reload) {
          log.step("Reloading Caddy configuration...");
          await caddyManager.reloadCaddy();
          log.success("Caddy configuration reloaded successfully.");
        }

        // If no options provided, show status
        if (!options.list && !options.cleanup && !options.reload) {
          const info = caddyManager.getCaddyInfo();
          
          console.log(chalk.cyan("\nCaddy Manager Status:"));
          console.log(chalk.gray("─".repeat(40)));
          console.log(`${chalk.gray("Caddyfile:")} ${info.caddyfilePath}`);
          console.log(`${chalk.gray("Domain:")} ${info.projectDomain}`);
          console.log(`${chalk.gray("Mode:")} ${info.isDevelopment ? 'Development' : 'Production'}`);
          console.log(`${chalk.gray("Dynamic Routes:")} ${info.dynamicRoutesCount}`);
          
          // Check Caddy health
          const isHealthy = await caddyManager.checkCaddyHealth();
          console.log(`${chalk.gray("Caddy Status:")} ${isHealthy ? chalk.green('Running') : chalk.red('Not Running')}`);
        }

        process.exit(0);
      } catch (error) {
        log.error(`Routes management error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  caddyfileCommand
    .command("generate-with-dynamic")
    .description("Generate Caddyfile including current dynamic routes")
    .option("--output <file>", "Output file path (defaults to stdout)")
    .action(async (options) => {
      try {
        log.step("Generating Caddyfile with dynamic routes...");
        
        const caddyManager = CaddyManager.getInstance();
        const content = await caddyManager.generateCaddyfileWithDynamicRoutes();
        
        if (options.output) {
          await Bun.write(resolve(options.output), content);
          log.success(`Caddyfile generated at ${resolve(options.output)}`);
        } else {
          console.log("\n" + chalk.cyan("Generated Caddyfile content:") + "\n");
          console.log(content);
        }
        
        process.exit(0);
      } catch (error) {
        log.error(`Generation error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
