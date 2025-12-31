// ABOUTME: Interactive setup wizard for configuring Deploy environments.
// ABOUTME: Guides users through local development or production setup with prompts.

import { Command } from "commander";
import { join, resolve } from "path";
import { homedir } from "os";
import { existsSync, readFileSync } from "fs";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import {
  generateSimpleCaddyfile,
  Database
} from "@keithk/deploy-core";
import {
  startCaddy
} from "../utils/caddy";
import {
  ensureDir,
  commandExists,
  execCommand,
  installCaddy,
  configureDnsmasq,
  trustLocalCerts,
  configureCaddy,
  configureFirewall
} from "../utils/setup-utils";

// Platform detection
const platform = process.platform;
const isLinux = platform === "linux";
const isMac = platform === "darwin";

// Paths
const projectRoot = resolve(process.cwd());

interface SetupConfig {
  environment: "local" | "production";
  domain: string;
  httpPort: number;
  sshPort: number;
  sitesDir: string;
  sshPublicKey: string;
}

/**
 * Display ASCII art header
 */
function displayHeader(): void {
  console.log(chalk.cyan(`
+==============================================================+
|                    Deploy Setup Wizard                        |
+==============================================================+
`));
  console.log(chalk.gray("This will configure your Deploy instance.\n"));
}

/**
 * Validate domain format
 */
function validateDomain(input: string): boolean | string {
  if (!input || input.trim() === "") {
    return "Domain is required";
  }

  // Allow localhost for local development
  if (input === "localhost") {
    return true;
  }

  // Simple domain validation - allows subdomains and TLDs
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)+$/;
  if (!domainRegex.test(input)) {
    return "Please enter a valid domain name (e.g., example.com or dev.local)";
  }

  return true;
}

/**
 * Validate port number
 */
function validatePort(input: string): boolean | string {
  const port = parseInt(input, 10);
  if (isNaN(port)) {
    return "Please enter a valid number";
  }
  if (port < 1 || port > 65535) {
    return "Port must be between 1 and 65535";
  }
  return true;
}

/**
 * Validate SSH public key - accepts key content or file path
 */
function validateSshKey(input: string): boolean | string {
  if (!input || input.trim() === "") {
    return "SSH public key is required for authentication";
  }

  const trimmed = input.trim();

  // Check if it's a file path
  if (trimmed.startsWith("~") || trimmed.startsWith("/") || trimmed.startsWith("./")) {
    const expandedPath = trimmed.startsWith("~")
      ? trimmed.replace("~", homedir())
      : resolve(trimmed);

    if (!existsSync(expandedPath)) {
      return `File not found: ${expandedPath}`;
    }
    return true;
  }

  // Check if it looks like a valid SSH public key
  if (trimmed.startsWith("ssh-") || trimmed.startsWith("ecdsa-") || trimmed.startsWith("sk-")) {
    return true;
  }

  return "Please provide a valid SSH public key or path to key file (e.g., ~/.ssh/id_ed25519.pub)";
}

/**
 * Resolve SSH key - reads from file if path provided
 */
function resolveSshKey(input: string): string {
  const trimmed = input.trim();

  if (trimmed.startsWith("~") || trimmed.startsWith("/") || trimmed.startsWith("./")) {
    const expandedPath = trimmed.startsWith("~")
      ? trimmed.replace("~", homedir())
      : resolve(trimmed);

    return readFileSync(expandedPath, "utf-8").trim();
  }

  return trimmed;
}

/**
 * Collect setup configuration through interactive prompts
 */
async function collectConfig(): Promise<SetupConfig> {
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "environment",
      message: "Environment:",
      choices: [
        { name: "Local Development", value: "local" },
        { name: "Production Server", value: "production" }
      ],
      default: "local"
    },
    {
      type: "input",
      name: "domain",
      message: "Domain name:",
      default: (answers: { environment: string }) =>
        answers.environment === "local" ? "localhost" : undefined,
      validate: validateDomain
    },
    {
      type: "input",
      name: "httpPort",
      message: "HTTP port for the server:",
      default: "3000",
      validate: validatePort,
      filter: (input: string) => parseInt(input, 10)
    },
    {
      type: "input",
      name: "sshPort",
      message: "SSH port for authentication:",
      default: "2222",
      validate: validatePort,
      filter: (input: string) => parseInt(input, 10)
    },
    {
      type: "input",
      name: "sitesDir",
      message: "Where should sites be stored?",
      default: (answers: { environment: string }) =>
        answers.environment === "local" ? "./sites" : "/var/deploy/sites"
    },
    {
      type: "input",
      name: "sshPublicKey",
      message: "SSH public key for authentication (paste key or path to file):",
      default: "~/.ssh/id_ed25519.pub",
      validate: validateSshKey
    }
  ]);

  return answers as SetupConfig;
}

/**
 * Create the .env file with configuration
 */
async function createEnvFile(config: SetupConfig): Promise<void> {
  const envPath = join(projectRoot, ".env");

  let envContent = "";

  // Read existing .env if present
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, "utf-8");
  }

  // Helper to set or update a variable
  const setEnvVar = (key: string, value: string) => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `${key}=${value}\n`;
    }
  };

  setEnvVar("PROJECT_DOMAIN", config.domain);
  setEnvVar("PORT", String(config.httpPort));
  setEnvVar("SSH_PORT", String(config.sshPort));
  setEnvVar("SITES_DIR", config.sitesDir);
  setEnvVar("NODE_ENV", config.environment === "production" ? "production" : "development");

  await Bun.write(envPath, envContent);
}

/**
 * Generate SSH host key if not exists
 */
async function generateHostKey(dataDir: string): Promise<boolean> {
  const hostKeyPath = join(dataDir, "host_key");

  if (existsSync(hostKeyPath)) {
    return true;
  }

  const result = await execCommand(
    "ssh-keygen",
    ["-t", "ed25519", "-f", hostKeyPath, "-N", ""],
    {},
    undefined
  );

  return result.success;
}

/**
 * Save authorized_keys file
 */
async function saveAuthorizedKeys(dataDir: string, publicKey: string): Promise<void> {
  const authKeysPath = join(dataDir, "authorized_keys");
  const resolvedKey = resolveSshKey(publicKey);
  await Bun.write(authKeysPath, resolvedKey + "\n");
}

/**
 * Initialize database and run migrations
 */
async function initializeDatabase(dataDir: string): Promise<void> {
  const db = Database.getInstance({ dataDir });
  await db.runMigrations();
}

/**
 * Execute interactive setup
 */
async function runInteractiveSetup(options: { skipCaddy?: boolean } = {}): Promise<void> {
  displayHeader();

  const config = await collectConfig();

  console.log("");
  console.log(chalk.cyan("Setting up...\n"));

  const configDir = join(projectRoot, "config");
  const dataDir = join(projectRoot, "data");
  const sitesDir = config.sitesDir.startsWith("/")
    ? config.sitesDir
    : join(projectRoot, config.sitesDir);

  // Step 1: Create data directory
  let spinner = ora("Creating data directory").start();
  try {
    await ensureDir(dataDir);
    spinner.succeed(chalk.green("Created data directory"));
  } catch (err) {
    spinner.fail(chalk.red("Failed to create data directory"));
    throw err;
  }

  // Step 2: Create sites directory
  spinner = ora("Creating sites directory").start();
  try {
    await ensureDir(sitesDir);
    spinner.succeed(chalk.green("Created sites directory"));
  } catch (err) {
    spinner.fail(chalk.red("Failed to create sites directory"));
    throw err;
  }

  // Step 3: Create config directory
  spinner = ora("Creating config directory").start();
  try {
    await ensureDir(configDir);
    spinner.succeed(chalk.green("Created config directory"));
  } catch (err) {
    spinner.fail(chalk.red("Failed to create config directory"));
    throw err;
  }

  // Step 4: Generate SSH host key
  spinner = ora("Generating SSH host key").start();
  try {
    const success = await generateHostKey(dataDir);
    if (success) {
      spinner.succeed(chalk.green("Generated SSH host key"));
    } else {
      spinner.warn(chalk.yellow("SSH host key already exists"));
    }
  } catch (err) {
    spinner.fail(chalk.red("Failed to generate SSH host key"));
    throw err;
  }

  // Step 5: Save authorized_keys
  spinner = ora("Saving authorized_keys").start();
  try {
    await saveAuthorizedKeys(dataDir, config.sshPublicKey);
    spinner.succeed(chalk.green("Saved authorized_keys"));
  } catch (err) {
    spinner.fail(chalk.red("Failed to save authorized_keys"));
    throw err;
  }

  // Step 6: Create Caddyfile
  spinner = ora("Creating Caddyfile").start();
  try {
    const caddyContent = generateSimpleCaddyfile(config.domain, config.httpPort);
    await Bun.write(join(configDir, "Caddyfile"), caddyContent);
    spinner.succeed(chalk.green("Created Caddyfile"));
  } catch (err) {
    spinner.fail(chalk.red("Failed to create Caddyfile"));
    throw err;
  }

  // Step 7: Create .env file
  spinner = ora("Creating .env file").start();
  try {
    await createEnvFile(config);
    spinner.succeed(chalk.green("Created .env file"));
  } catch (err) {
    spinner.fail(chalk.red("Failed to create .env file"));
    throw err;
  }

  // Step 8: Initialize database
  spinner = ora("Initializing database").start();
  try {
    await initializeDatabase(dataDir);
    spinner.succeed(chalk.green("Initialized database"));
  } catch (err) {
    spinner.fail(chalk.red("Failed to initialize database"));
    throw err;
  }

  // Step 9: Run migrations
  spinner = ora("Running migrations").start();
  try {
    // Already run in initializeDatabase
    spinner.succeed(chalk.green("Ran migrations"));
  } catch (err) {
    spinner.fail(chalk.red("Failed to run migrations"));
    throw err;
  }

  // Additional setup for local development
  if (config.environment === "local" && !options.skipCaddy) {
    // Install Caddy if needed
    if (!(await commandExists("caddy"))) {
      spinner = ora("Installing Caddy").start();
      const log = {
        info: () => {},
        success: () => {},
        warning: () => {},
        error: () => {},
        step: () => {}
      };
      const success = await installCaddy(log);
      if (success) {
        spinner.succeed(chalk.green("Installed Caddy"));
      } else {
        spinner.warn(chalk.yellow("Could not install Caddy automatically"));
      }
    }

    // Configure dnsmasq on macOS
    if (isMac && config.domain !== "localhost") {
      spinner = ora("Configuring dnsmasq").start();
      const log = {
        info: () => {},
        success: () => {},
        warning: () => {},
        error: () => {},
        step: () => {}
      };
      const success = await configureDnsmasq(config.domain, log);
      if (success) {
        spinner.succeed(chalk.green("Configured dnsmasq"));
      } else {
        spinner.warn(chalk.yellow("Could not configure dnsmasq"));
      }
    }

    // Trust local certificates on macOS
    if (isMac) {
      spinner = ora("Setting up local HTTPS certificates").start();
      const log = {
        info: () => {},
        success: () => {},
        warning: () => {},
        error: () => {},
        step: () => {}
      };
      const success = await trustLocalCerts(config.domain, configDir, log);
      if (success) {
        spinner.succeed(chalk.green("Set up local HTTPS certificates"));
      } else {
        spinner.warn(chalk.yellow("Could not set up HTTPS (will use HTTP)"));
      }
    }
  }

  // Configure firewall on production Linux
  if (config.environment === "production" && isLinux) {
    spinner = ora("Configuring firewall").start();
    const log = {
      info: () => {},
      success: () => {},
      warning: () => {},
      error: () => {},
      step: () => {}
    };
    const success = await configureFirewall(log);
    if (success) {
      spinner.succeed(chalk.green("Configured firewall"));
    } else {
      spinner.warn(chalk.yellow("Could not configure firewall"));
    }
  }

  // Display completion message
  console.log("");
  console.log(chalk.green.bold("Setup complete!"));
  console.log("");
  console.log(chalk.cyan("To start the server:"));
  console.log(chalk.white("  deploy start"));
  console.log("");
  console.log(chalk.cyan("To access the dashboard:"));
  console.log(chalk.white(`  ssh ${config.domain} -p ${config.sshPort}`));
  console.log("");

  if (config.environment === "production") {
    console.log(chalk.cyan("DNS Configuration:"));
    console.log(chalk.white(`  - A record: ${config.domain} -> your server IP`));
    console.log(chalk.white(`  - CNAME record: *.${config.domain} -> ${config.domain}`));
    console.log("");
  }
}

/**
 * Legacy non-interactive setup for backward compatibility
 */
async function legacySetup(
  environment: string = "local",
  options: { skipCaddy?: boolean; interactive?: boolean } = {}
): Promise<void> {
  // If --interactive flag or no environment specified, run interactive mode
  if (options.interactive || !environment) {
    await runInteractiveSetup(options);
    return;
  }

  // Otherwise, run the legacy setup for backward compatibility
  const log = {
    info: (message: string) =>
      console.log(chalk.blue("[INFO]") + " " + message),
    success: (message: string) =>
      console.log(chalk.green("[SUCCESS]") + " " + message),
    warning: (message: string) =>
      console.log(chalk.yellow("[WARNING]") + " " + message),
    error: (message: string) =>
      console.log(chalk.red("[ERROR]") + " " + message),
    step: (message: string) =>
      console.log("\n" + chalk.cyan("==>") + " " + message)
  };

  try {
    if (environment === "production") {
      log.step("Starting production setup...");
      log.info("For interactive setup, run: deploy setup --interactive");
      // Run minimal production setup
      const configDir = join(projectRoot, "config");
      const dataDir = join(projectRoot, "data");

      await ensureDir(configDir);
      await ensureDir(dataDir);

      const domain = process.env.PROJECT_DOMAIN || "localhost";
      const port = parseInt(process.env.PORT || "3000", 10);

      const caddyContent = generateSimpleCaddyfile(domain, port);
      await Bun.write(join(configDir, "Caddyfile"), caddyContent);

      await initializeDatabase(dataDir);

      log.success("Production setup completed!");
    } else {
      log.step("Starting local development setup...");

      const configDir = join(projectRoot, "config");
      const dataDir = join(projectRoot, "data");

      await ensureDir(configDir);
      await ensureDir(dataDir);

      const domain = process.env.PROJECT_DOMAIN || "localhost";
      const port = parseInt(process.env.PORT || "3000", 10);

      // Create a local development Caddyfile
      let useHttps = false;
      if (isMac && !options.skipCaddy) {
        useHttps = await trustLocalCerts(domain, configDir, log);
      }

      await configureCaddy(domain, projectRoot, configDir, useHttps, log);
      await initializeDatabase(dataDir);

      if (!options.skipCaddy) {
        await startCaddy();
      }

      log.success("Local development setup completed!");
      log.info(`Access your sites at http${useHttps ? "s" : ""}://${domain}`);
    }
  } catch (error) {
    log.error(
      `Setup failed: ${error instanceof Error ? error.message : String(error)}`
    );
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
      "Environment to set up (local or production)"
    )
    .option("--skip-caddy", "Skip Caddy installation and configuration")
    .option("-i, --interactive", "Run interactive setup wizard")
    .action(async (environment: string | undefined, options: { skipCaddy?: boolean; interactive?: boolean }) => {
      // If no environment specified or interactive flag, run interactive mode
      if (!environment || options.interactive) {
        await runInteractiveSetup(options);
      } else {
        await legacySetup(environment, options);
      }
    });
}
