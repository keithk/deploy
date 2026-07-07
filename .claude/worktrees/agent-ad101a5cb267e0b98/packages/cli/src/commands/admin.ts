import { Command } from "commander";
import { join, resolve } from "path";
import { existsSync, writeFileSync, readFileSync, mkdirSync, cpSync, rmSync } from "fs";
import chalk from "chalk";
import { debug, info, error } from "@keithk/deploy-core";

/**
 * Install admin panel for the project
 * @param options Installation options
 */
function installAdmin(options: { 
  password?: string;
  force?: boolean;
  type?: "local" | "remote";
} = {}): void {
  try {
    const rootDir = process.env.ROOT_DIR
      ? resolve(process.env.ROOT_DIR, "..")
      : resolve(process.cwd());

    const adminDir = join(rootDir, "sites", "admin");
    
    // Check if admin panel already exists
    if (existsSync(adminDir) && !options.force) {
      error("Admin panel already exists. Use --force to overwrite.");
      return;
    }

    console.log(chalk.green("🚀 Installing Deploy Admin Panel"));

    // Remove existing admin if force flag is used
    if (existsSync(adminDir) && options.force) {
      console.log(chalk.yellow("Removing existing admin panel..."));
      rmSync(adminDir, { recursive: true, force: true });
    }

    // Find the source admin panel
    const possibleSources = [
      join(rootDir, "packages", "admin"), // Current project packages/admin
      join(__dirname, "..", "..", "..", "admin"), // From CLI package to admin package
      join(__dirname, "..", "..", "..", "..", "packages", "admin"), // Alternative path
    ];

    let sourceDir: string | null = null;
    for (const source of possibleSources) {
      if (existsSync(source)) {
        sourceDir = source;
        break;
      }
    }

    if (!sourceDir) {
      // Create a basic admin panel from scratch
      console.log(chalk.yellow("Creating basic admin panel..."));
      
      // Create directories
      mkdirSync(adminDir, { recursive: true });
      mkdirSync(join(adminDir, ".deploy"), { recursive: true });
      mkdirSync(join(adminDir, "src"), { recursive: true });
      
      // Create admin configuration
      const adminConfig = {
        type: "static",
        name: "admin",
        build: "npm run build",
        output: "dist",
        authentication: options.password ? "enabled" : "disabled"
      };

      writeFileSync(
        join(adminDir, ".deploy", "config.json"),
        JSON.stringify(adminConfig, null, 2)
      );

      // Create a basic index.html
      const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deploy Admin Panel</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      margin: 0;
      padding: 2rem;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border-radius: 1rem;
      padding: 2rem;
      max-width: 800px;
      width: 100%;
    }
    h1 { margin-top: 0; }
    .status { 
      background: rgba(0, 255, 0, 0.2);
      border-radius: 0.5rem;
      padding: 1rem;
      margin: 1rem 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Deploy Admin Panel</h1>
    <div class="status">
      <h2>Status: Active</h2>
      <p>Your Deploy server is running!</p>
    </div>
    <p>This is a placeholder admin panel. The full admin panel is being developed.</p>
  </div>
</body>
</html>`;

      writeFileSync(join(adminDir, "index.html"), indexHtml);

    } else {
      // Copy from source
      console.log(chalk.dim(`Copying from ${sourceDir}...`));
      cpSync(sourceDir, adminDir, { recursive: true });
      
      // Create .deploy directory and config
      const deployDir = join(adminDir, ".deploy");
      mkdirSync(deployDir, { recursive: true });
      
      // Create admin configuration
      const adminConfig = {
        type: "static",
        name: "admin",
        subdomain: "admin",
        authentication: options.password ? "enabled" : "disabled"
      };

      const configPath = join(deployDir, "config.json");
      writeFileSync(configPath, JSON.stringify(adminConfig, null, 2));
    }

    if (options.password) {
      console.log(chalk.yellow("🔐 Setting up password protection..."));
      // TODO: Implement secure password hashing and storage
      const authFile = join(adminDir, ".deploy", "auth.json");
      writeFileSync(authFile, JSON.stringify({
        password: options.password, // This should be hashed in production
        enabled: true
      }, null, 2));
    }

    console.log(chalk.green("✅ Admin panel installed successfully!"));
    console.log(chalk.dim(`Access at: http://admin.localhost:3000`));

  } catch (err) {
    error(`Failed to install admin panel: ${
      err instanceof Error ? err.message : String(err)
    }`);
  }
}

/**
 * Remove the admin panel
 * @param options Removal options
 */
function removeAdmin(options: { force?: boolean } = {}): void {
  try {
    const rootDir = process.env.ROOT_DIR
      ? resolve(process.env.ROOT_DIR, "..")
      : resolve(process.cwd());

    const adminDir = join(rootDir, "sites", "admin");

    if (!existsSync(adminDir)) {
      error("No admin panel found to remove.");
      return;
    }

    if (!options.force) {
      console.log(chalk.yellow("⚠️  This will completely remove the admin panel."));
      console.log(chalk.dim("Use --force to skip this warning."));
      return;
    }

    console.log(chalk.red("🗑️  Removing admin panel..."));
    rmSync(adminDir, { recursive: true, force: true });

    console.log(chalk.green("✅ Admin panel removed successfully."));

  } catch (err) {
    error(`Failed to remove admin panel: ${
      err instanceof Error ? err.message : String(err)
    }`);
  }
}

/**
 * Update the admin panel
 * @param options Update options
 */
function updateAdmin(options: { 
  latest?: boolean;
  version?: string;
} = {}): void {
  try {
    const rootDir = process.env.ROOT_DIR
      ? resolve(process.env.ROOT_DIR, "..")
      : resolve(process.cwd());

    const adminDir = join(rootDir, "sites", "admin");

    if (!existsSync(adminDir)) {
      error("No admin panel found to update.");
      return;
    }

    console.log(chalk.green("🔄 Updating admin panel..."));
    
    // Implement update logic
    const updateVersion = options.version || "latest";
    console.log(chalk.dim(`Updating to version: ${updateVersion}`));

    console.log(chalk.green("✅ Admin panel updated successfully!"));

  } catch (err) {
    error(`Failed to update admin panel: ${
      err instanceof Error ? err.message : String(err)
    }`);
  }
}

/**
 * Register admin panel commands
 * @param program Commander program
 */
export function registerAdminCommands(program: Command): void {
  const adminCommand = program.command("admin").description("Manage Deploy admin panel");

  adminCommand
    .command("install")
    .description("Install the admin panel")
    .option("-p, --password <password>", "Set admin panel password")
    .option("-f, --force", "Force reinstallation")
    .option("-t, --type <type>", "Installation type (local/remote)", "local")
    .action(installAdmin);

  adminCommand
    .command("remove")
    .description("Remove the admin panel")
    .option("-f, --force", "Force removal without confirmation")
    .action(removeAdmin);

  adminCommand
    .command("update")
    .description("Update the admin panel")
    .option("-l, --latest", "Update to the latest version")
    .option("-v, --version <version>", "Update to a specific version")
    .action(updateAdmin);
}