import { migrationManager, validatePassword, validateEmail, validateUsername } from "@keithk/deploy-core";
import { UserModel } from "@keithk/deploy-core/src/database/models/user";
import { readlineSync } from "../utils/cli-helpers";

// Create userModel instance
const userModel = new UserModel();

/**
 * Setup database and create admin user
 */
export async function setupDatabase(domain: string, log: any): Promise<boolean> {
  try {
    log.step("Initializing database...");
    
    // Run database migrations
    migrationManager.runMigrations();
    const status = migrationManager.getStatus();
    log.info(`Database updated to version ${status.current}`);
    
    // Check if admin user already exists
    const existingAdmins = await checkExistingAdmins();
    
    if (existingAdmins.length > 0) {
      log.info(`Admin user already exists: ${existingAdmins[0].username}`);
      
      // Migrate existing sites if any
      const migratedCount = userModel.migrateExistingSitesToUser(existingAdmins[0].id);
      if (migratedCount > 0) {
        log.success(`Migrated ${migratedCount} existing sites to admin user`);
      }
      
      return true;
    }
    
    log.step("Creating admin user...");
    
    // Prompt for admin user details
    const adminData = await promptAdminDetails(domain, log);
    
    // Create admin user
    const adminId = await userModel.createUser({
      username: adminData.username,
      email: adminData.email,
      password: adminData.password,
      is_admin: true,
      max_sites: 999, // High limit for admin
      max_memory_mb: 4096,
      max_cpu_cores: 2.0,
      max_storage_mb: 10240
    });
    
    log.success(`Admin user created: ${adminData.username} (ID: ${adminId})`);
    
    // Migrate existing sites to admin user
    const migratedCount = userModel.migrateExistingSitesToUser(adminId);
    if (migratedCount > 0) {
      log.success(`Migrated ${migratedCount} existing sites to admin user`);
    }
    
    // Save admin domain setting
    await saveSystemSetting('admin_domain', getSubdomainFromDomain(domain, 'admin'));
    await saveSystemSetting('editor_domain', getSubdomainFromDomain(domain, 'editor'));
    
    log.info(`Admin panel will be available at: admin.${domain}`);
    log.info(`Editor will be available at: editor.${domain}`);
    
    return true;
    
  } catch (error) {
    log.error(`Database setup failed: ${error}`);
    return false;
  }
}

/**
 * Check for existing admin users
 */
async function checkExistingAdmins(): Promise<{ id: number; username: string }[]> {
  try {
    const admins = userModel.getAllUsers().filter(user => user.is_admin);
    return admins.map(admin => ({ id: admin.id, username: admin.username }));
  } catch (error) {
    return [];
  }
}

/**
 * Prompt user for admin details
 */
async function promptAdminDetails(domain: string, log: any): Promise<{
  username: string;
  email: string;
  password: string;
}> {
  log.info("Setting up admin user for the community platform...");
  log.info(`This user will be able to access the admin panel at admin.${domain}`);
  
  let username: string;
  let email: string;
  let password: string;
  
  // Get username
  while (true) {
    username = await readlineSync("Admin username: ");
    if (!username.trim()) {
      log.error("Username cannot be empty");
      continue;
    }
    
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      log.error(`Invalid username: ${usernameValidation.errors.join(', ')}`);
      continue;
    }
    
    break;
  }
  
  // Get email
  while (true) {
    email = await readlineSync("Admin email: ");
    if (!email.trim()) {
      log.error("Email cannot be empty");
      continue;
    }
    
    if (!validateEmail(email)) {
      log.error("Invalid email format");
      continue;
    }
    
    break;
  }
  
  // Get password
  while (true) {
    password = await readlineSync("Admin password: ", true); // Hidden input
    if (!password.trim()) {
      log.error("Password cannot be empty");
      continue;
    }
    
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      log.error(`Password requirements not met:`);
      passwordValidation.errors.forEach(error => log.error(`  - ${error}`));
      continue;
    }
    
    const confirmPassword = await readlineSync("Confirm password: ", true);
    if (password !== confirmPassword) {
      log.error("Passwords do not match");
      continue;
    }
    
    break;
  }
  
  return { username, email, password };
}

/**
 * Extract subdomain from domain setting
 */
function getSubdomainFromDomain(domain: string, subdomain: string): string {
  // If domain already includes subdomain, return as-is
  if (domain.startsWith(subdomain + '.')) {
    return domain;
  }
  
  return `${subdomain}.${domain}`;
}

/**
 * Save system setting
 */
async function saveSystemSetting(key: string, value: string): Promise<void> {
  try {
    const { Database } = await import("@keithk/deploy-core");
    const db = Database.getInstance();
    
    db.run(
      `INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)`,
      [key, value]
    );
  } catch (error) {
    // Non-critical error, continue
    console.warn(`Failed to save system setting ${key}: ${error}`);
  }
}

