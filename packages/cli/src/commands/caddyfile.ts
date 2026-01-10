
// ABOUTME: CLI commands for managing Caddy configuration.
// ABOUTME: Provides update, push, configure, and show subcommands.

import { Command } from "commander";
import { resolve, join } from "path";
import chalk from "chalk";
import { generateCaddyfileContent, generateSimpleCaddyfile } from "@keithk/deploy-core";
import { execCommand, ensureDir } from "../utils/setup-utils";

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

  caddyfileCommand
    .command("push")
    .description("Push Caddyfile to a remote production server via SSH")
    .option("-h, --host <host>", "Remote host (e.g., root@192.168.1.100)")
    .option("-d, --domain <domain>", "Domain to use (overrides PROJECT_DOMAIN)")
    .option("-p, --port <port>", "Deploy server port", "3000")
    .option("--on-demand-tls", "Enable on-demand TLS for subdomains")
    .option("--dry-run", "Show what would be pushed without executing")
    .action(async (options) => {
      try {
        log.step("Pushing Caddyfile to remote server...");

        const host = options.host || process.env.DEPLOY_HOST;
        if (!host) {
          log.error("No host specified. Use --host or set DEPLOY_HOST env var.");
          log.info("Example: deploy caddyfile push --host root@192.168.1.100");
          process.exit(1);
        }

        const domain = options.domain || process.env.PROJECT_DOMAIN;
        if (!domain) {
          log.error("No domain specified. Use --domain or set PROJECT_DOMAIN.");
          process.exit(1);
        }

        const port = parseInt(options.port, 10);

        log.info(`Host: ${host}`);
        log.info(`Domain: ${domain}`);
        log.info(`Port: ${port}`);
        log.info(`On-demand TLS: ${options.onDemandTls ? 'enabled' : 'disabled'}`);

        // Set env var for on-demand TLS if requested
        if (options.onDemandTls) {
          process.env.ENABLE_ON_DEMAND_TLS = "true";
        }

        // Generate simple Caddyfile for production
        const caddyfileContent = generateSimpleCaddyfile(domain, port);

        if (options.dryRun) {
          log.info("\n--- Dry run: Would push this Caddyfile ---\n");
          console.log(caddyfileContent);
          log.info("\n--- End of Caddyfile ---");
          process.exit(0);
        }

        // Write to temp file
        const tempFile = `/tmp/caddyfile-push-${Date.now()}`;
        await Bun.write(tempFile, caddyfileContent);

        // Push via SSH
        log.info("Copying Caddyfile to remote server...");
        const scpProc = Bun.spawn(["scp", tempFile, `${host}:/tmp/Caddyfile.new`], {
          stdio: ["inherit", "pipe", "pipe"],
        });
        const scpExit = await scpProc.exited;
        if (scpExit !== 0) {
          const stderr = await new Response(scpProc.stderr).text();
          log.error(`Failed to copy Caddyfile: ${stderr}`);
          process.exit(1);
        }

        // Move to /etc/caddy and reload
        log.info("Installing Caddyfile and reloading Caddy...");
        const sshProc = Bun.spawn([
          "ssh",
          host,
          "cp /tmp/Caddyfile.new /etc/caddy/Caddyfile && systemctl reload caddy && rm /tmp/Caddyfile.new"
        ], {
          stdio: ["inherit", "pipe", "pipe"],
        });
        const sshExit = await sshProc.exited;
        if (sshExit !== 0) {
          const stderr = await new Response(sshProc.stderr).text();
          log.error(`Failed to install Caddyfile: ${stderr}`);
          process.exit(1);
        }

        // Cleanup local temp file
        await Bun.spawn(["rm", tempFile]).exited;

        log.success(`Caddyfile pushed to ${host} and Caddy reloaded`);
        log.info(`Site should be accessible at https://${domain}`);
        process.exit(0);

      } catch (error) {
        log.error(
          `Error pushing Caddyfile: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        process.exit(1);
      }
    });
}
