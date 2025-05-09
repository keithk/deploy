
import { Command } from "commander";
import { resolve, join } from "path";
import chalk from "chalk";
import { generateCaddyfileContent } from "@keithk/deploy-core";
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
}
