import { Command } from "commander";
import { info, error, warn } from "../../core";
import { Database } from "../../core/database/database";
import { hashPassword } from "../../core/auth/password";
import { readlineSync } from "../utils/cli-helpers";

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
 * Reset admin password
 */
async function resetAdminPassword(): Promise<void> {
  try {
    // Initialize database
    const db = Database.getInstance();
    
    // Prompt for username (default to admin)
    const username = await readlineSync("Enter admin username (default: admin): ") || "admin";
    
    // Check if user exists
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND is_admin = 1").get(username);
    
    if (!user) {
      warn(`Admin user '${username}' not found.`);
      const createNew = await readlineSync("Would you like to create a new admin user? (y/n): ");
      
      if (createNew?.toLowerCase() === 'y') {
        await createAdminUser(username);
      }
      return;
    }
    
    // Prompt for new password
    const password = await readlineSync("Enter new password: ", true);
    const confirmPassword = await readlineSync("Confirm new password: ", true);
    
    if (password !== confirmPassword) {
      error("Passwords do not match!");
      return;
    }
    
    if (!password || password.length < 6) {
      error("Password must be at least 6 characters!");
      return;
    }
    
    // Hash the password
    const passwordHash = await hashPassword(password);
    
    // Update the password in database
    db.prepare("UPDATE users SET password_hash = ? WHERE email = ?").run(passwordHash, username);
    
    info(`✅ Password reset successfully for admin user: ${username}`);
    info("🔐 You can now login to the admin panel with your new password");
  } catch (err) {
    error(`Failed to reset admin password: ${
      err instanceof Error ? err.message : String(err)
    }`);
  }
}

/**
 * Create a new admin user
 */
async function createAdminUser(username: string): Promise<void> {
  try {
    const db = Database.getInstance();
    
    // Prompt for password
    const password = await readlineSync("Enter password for new admin: ", true);
    const confirmPassword = await readlineSync("Confirm password: ", true);
    
    if (password !== confirmPassword) {
      error("Passwords do not match!");
      return;
    }
    
    if (!password || password.length < 6) {
      error("Password must be at least 6 characters!");
      return;
    }
    
    // Hash the password
    const passwordHash = await hashPassword(password);
    
    // Create the admin user
    db.prepare(`
      INSERT INTO users (email, password_hash, is_admin, created_at)
      VALUES (?, ?, 1, datetime('now'))
    `).run(username, passwordHash);
    
    info(`✅ Admin user '${username}' created successfully!`);
    info("🔐 You can now login to the admin panel");
  } catch (err) {
    error(`Failed to create admin user: ${
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

  adminCommand
    .command("reset-password")
    .description("Reset admin password")
    .action(resetAdminPassword);
}