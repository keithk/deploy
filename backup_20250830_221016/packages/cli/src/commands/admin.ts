import { Command } from "commander";
import { info, error } from "@keithk/deploy-core";

/**
 * Enable the admin panel
 */
function enableAdmin(): void {
  try {
    // Check if admin is already enabled by checking environment or config
    if (process.env.ADMIN_DISABLED === 'true') {
      delete process.env.ADMIN_DISABLED;
      info("✅ Admin panel enabled");
      info("💡 Restart your server with 'deploy dev' or 'deploy start' to apply changes");
    } else {
      info("✅ Admin panel is already enabled");
    }
    
    info("🌐 Admin panel will be available at: https://admin.{your-domain}");
  } catch (err) {
    error(`Failed to enable admin panel: ${
      err instanceof Error ? err.message : String(err)
    }`);
  }
}

/**
 * Disable the admin panel
 */
function disableAdmin(): void {
  try {
    process.env.ADMIN_DISABLED = 'true';
    info("✅ Admin panel disabled");
    info("💡 Restart your server with 'deploy dev' or 'deploy start' to apply changes");
  } catch (err) {
    error(`Failed to disable admin panel: ${
      err instanceof Error ? err.message : String(err)
    }`);
  }
}

/**
 * Show admin panel status
 */
function adminStatus(): void {
  try {
    const isEnabled = process.env.ADMIN_DISABLED !== 'true';
    
    if (isEnabled) {
      info("✅ Admin panel is enabled");
      info("🌐 Available at: https://admin.{your-domain}");
    } else {
      info("❌ Admin panel is disabled");
    }
    
    info("💡 Use 'deploy admin enable/disable' to change status");
  } catch (err) {
    error(`Failed to check admin status: ${
      err instanceof Error ? err.message : String(err)
    }`);
  }
}

/**
 * Register simplified admin panel commands
 * @param program Commander program
 */
export function registerAdminCommands(program: Command): void {
  const adminCommand = program.command("admin").description("Manage the built-in admin panel");

  adminCommand
    .command("enable")
    .description("Enable the built-in admin panel")
    .action(enableAdmin);

  adminCommand
    .command("disable")
    .description("Disable the built-in admin panel")
    .action(disableAdmin);

  adminCommand
    .command("status")
    .description("Show admin panel status")
    .action(adminStatus);
}