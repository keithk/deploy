#!/usr/bin/env bun
// packages/cli/src/scripts/setup.ts

import { join, resolve, dirname } from "path";
import { homedir } from "os";
import { generateCaddyfileContent } from "../../core";

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
const projectRoot = resolve("../..");
const configDir = join(projectRoot, "config");
const caddyfilePath = join(configDir, "Caddyfile");
const dnsmasqConfPath = join(configDir, "dnsmasq.conf");

// Execute a command and return the result
async function execCommand(
  command: string,
  args: string[] = [],
  options: any = {}
): Promise<{ success: boolean; output: string }> {
  log.info(`Executing: ${command} ${args.join(" ")}`);

  try {
    const proc = Bun.spawn([command, ...args], {
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env, ...options.env },
      cwd: options.cwd || process.cwd()
    });

    const output = await new Response(proc.stdout).text();
    const errorOutput = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      log.error(`Command exited with code ${exitCode}`);
      if (errorOutput) log.error(errorOutput);
      return { success: false, output: errorOutput };
    }

    return { success: true, output };
  } catch (error) {
    log.error(
      `Command failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return { success: false, output: String(error) };
  }
}

// Check if a command exists
async function commandExists(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", command], {
      stdio: ["ignore", "ignore", "ignore"]
    });
    return (await proc.exited) === 0;
  } catch (error) {
    return false;
  }
}

// Ensure directory exists
async function ensureDir(dir: string): Promise<void> {
  try {
    const dirExists = await Bun.file(dir).exists();
    if (!dirExists) {
      await execCommand("mkdir", ["-p", dir]);
    }
  } catch (error) {
    throw new Error(`Failed to create directory ${dir}: ${error}`);
  }
}

// Get domain from .env file or use default
async function getDomain(): Promise<string> {
  let domain = "dev.flexi";
  try {
    const envPath = join(projectRoot, ".env");
    const envExists = await Bun.file(envPath).exists();

    if (envExists) {
      const envContent = await Bun.file(envPath).text();
      const domainMatch = envContent.match(/PROJECT_DOMAIN=([^\s]+)/);
      if (domainMatch && domainMatch[1]) {
        domain = domainMatch[1];
      }
    }
  } catch (error) {
    log.warning(
      `Could not read .env file: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    log.warning(`Using default domain: ${domain}`);
  }
  return domain;
}

// Update or create .env file with PROJECT_DOMAIN
async function updateEnvFile(domain: string): Promise<boolean> {
  log.step(`Updating .env file with PROJECT_DOMAIN=${domain}...`);

  try {
    const envPath = join(projectRoot, ".env");
    let envContent = "";

    // Read existing .env file if it exists
    if (await Bun.file(envPath).exists()) {
      envContent = await Bun.file(envPath).text();
    }

    // Update or add PROJECT_DOMAIN
    if (!envContent.includes("PROJECT_DOMAIN=")) {
      envContent += `\nPROJECT_DOMAIN=${domain}\n`;
    } else {
      envContent = envContent.replace(
        /PROJECT_DOMAIN=.*/,
        `PROJECT_DOMAIN=${domain}`
      );
    }

    // Write updated content back to .env file
    await Bun.write(envPath, envContent);
    log.success(`Updated .env file with PROJECT_DOMAIN=${domain}`);
    return true;
  } catch (error) {
    log.error(
      `Failed to update .env file: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

// Install dependencies based on platform
async function installDependencies(): Promise<boolean> {
  log.step("Installing required dependencies...");

  // Check for Caddy
  if (!(await commandExists("caddy"))) {
    log.info("Caddy not found. Installing...");

    if (isMac && (await commandExists("brew"))) {
      await execCommand("brew", ["install", "caddy"]);
    } else if (isLinux) {
      // Use Caddy's official script for Linux
      await execCommand("bash", ["-c", "curl -sS https://webi.sh/caddy | sh"]);

      // Update PATH for this process
      process.env.PATH = `${homedir()}/.local/bin:${process.env.PATH}`;
    } else {
      log.error("Automatic Caddy installation not supported on this platform.");
      log.info(
        "Please install Caddy manually: https://caddyserver.com/download"
      );
      return false;
    }

    // Verify installation
    if (!(await commandExists("caddy"))) {
      log.error("Caddy installation failed.");
      return false;
    }
    log.success("Caddy installed successfully.");
  } else {
    log.success("Caddy is already installed.");
  }

  // Install dnsmasq on macOS for local development
  if (isMac) {
    if (!(await commandExists("dnsmasq"))) {
      log.info("dnsmasq not found. Installing...");
      if (await commandExists("brew")) {
        await execCommand("brew", ["install", "dnsmasq"]);
      } else {
        log.error("Homebrew not found. Please install Homebrew first.");
        log.info("https://brew.sh/");
        return false;
      }
    } else {
      log.success("dnsmasq is already installed.");
    }
  }

  return true;
}

// Configure dnsmasq (macOS only)
async function configureDnsmasq(domain: string): Promise<boolean> {
  if (!isMac) return true; // Skip on non-macOS platforms

  log.step("Configuring dnsmasq...");

  const dnsmasqConfDir = "/opt/homebrew/etc";
  const dnsmasqEntry = `address=/.${domain}/127.0.0.1`;

  try {
    // Check if the entry already exists
    const systemConfPath = `${dnsmasqConfDir}/dnsmasq.conf`;
    const confExists = await Bun.file(systemConfPath).exists();

    if (confExists) {
      const confContent = await Bun.file(systemConfPath).text();
      if (confContent.includes(dnsmasqEntry)) {
        log.success(`dnsmasq already configured for .${domain} domains.`);
        return true;
      }
    }

    // Add the entry to dnsmasq.conf
    await execCommand("bash", [
      "-c",
      `echo "${dnsmasqEntry}" | sudo tee -a ${systemConfPath}`
    ]);

    // Create resolver directory if it doesn't exist
    await execCommand("sudo", ["mkdir", "-p", "/etc/resolver"]);

    // Create resolver file for the domain
    await execCommand("bash", [
      "-c",
      `echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/${domain}`
    ]);

    // Restart dnsmasq
    await execCommand("sudo", ["brew", "services", "restart", "dnsmasq"]);

    log.success(
      `dnsmasq configured to resolve .${domain} domains to 127.0.0.1`
    );
    return true;
  } catch (error) {
    log.error(
      `Failed to configure dnsmasq: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

// Configure Caddy for HTTPS
async function configureCaddy(domain: string): Promise<boolean> {
  log.step("Configuring Caddy...");

  try {
    // Ensure config directory exists
    await ensureDir(configDir);

    // Also ensure ssl directory exists for certificates
    const sslDir = join(configDir, "ssl");
    await ensureDir(sslDir);

    // Generate certificates with mkcert if on macOS
    let certPath = "";
    let keyPath = "";

    if (isMac && (await commandExists("mkcert"))) {
      log.info("Generating certificates with mkcert...");

      // Generate wildcard certificate for the domain
      await execCommand("mkcert", [
        "-cert-file",
        join(sslDir, `${domain}.crt`),
        "-key-file",
        join(sslDir, `${domain}.key`),
        `*.${domain}`,
        domain
      ]);

      certPath = join(sslDir, `${domain}.crt`);
      keyPath = join(sslDir, `${domain}.key`);

      log.success(`Certificates generated at ${sslDir}`);
    }

    // Generate Caddyfile content using the shared utility
    let caddyfileContent = await generateCaddyfileContent(
      domain,
      join(projectRoot, "sites"),
      {
        info: log.info,
        warning: log.warning
      }
    );

    // Modify the generated content for local development
    // Add TLS configuration if certificates were generated
    if (certPath && keyPath) {
      // Add TLS directives to each domain section
      const tlsDirective = `\n  tls ${certPath} ${keyPath}`;

      // Add to root domain
      caddyfileContent = caddyfileContent.replace(
        `${domain} {`,
        `${domain} {${tlsDirective}`
      );

      // Add to subdomains
      caddyfileContent = caddyfileContent.replace(
        /(\w+)\.${domain} {/g,
        `$1.${domain} {${tlsDirective}`
      );
    } else {
      // If no certificates, use HTTP and disable auto HTTPS
      caddyfileContent = caddyfileContent.replace("{", "{\n  auto_https off");
    }

    // Write the Caddyfile to the project config directory
    await Bun.write(caddyfilePath, caddyfileContent);
    log.success(`Caddy configuration written to ${caddyfilePath}`);

    return true;
  } catch (error) {
    log.error(
      `Failed to configure Caddy: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

// Start Caddy using the project's Caddyfile
async function startCaddy(): Promise<boolean> {
  log.step("Starting Caddy server...");

  try {
    // Check if Caddy is already running
    let isRunning = false;
    try {
      const proc = Bun.spawn(["pgrep", "caddy"], {
        stdio: ["ignore", "ignore", "ignore"]
      });
      isRunning = (await proc.exited) === 0;
    } catch (error) {
      // Ignore error - assume not running
    }

    if (isRunning) {
      log.info("Caddy is already running. Reloading configuration...");

      // Stop any existing Caddy processes
      await execCommand("pkill", ["-f", "caddy"]);

      // Wait a moment for the process to stop
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Start Caddy with the project's Caddyfile
    log.info(`Starting Caddy with config: ${caddyfilePath}`);

    const caddyProc = Bun.spawn(
      ["caddy", "run", "--config", caddyfilePath, "--adapter", "caddyfile"],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env
      }
    );

    // Make this non-blocking - Caddy will run in the background
    setTimeout(async () => {
      // Check if Caddy started successfully
      const exitCode = await caddyProc.exited;
      if (exitCode !== null && exitCode !== 0) {
        const stderr = await new Response(caddyProc.stderr).text();
        log.error(`Caddy exited with code ${exitCode}`);
        if (stderr) log.error(stderr);
      }
    }, 500);

    log.success("Caddy started successfully.");
    log.info("To stop Caddy, run: pkill -f caddy");

    return true;
  } catch (error) {
    log.error(
      `Failed to start Caddy: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

// Trust local HTTPS certificates (macOS only)
async function trustLocalCerts(domain: string): Promise<boolean> {
  if (!isMac) return true; // Skip on non-macOS platforms

  log.step("Setting up local HTTPS certificates...");

  try {
    // For macOS, we'll use mkcert to create and trust local certificates
    if (!(await commandExists("mkcert"))) {
      log.info("Installing mkcert...");
      await execCommand("brew", ["install", "mkcert"]);

      // Also install nss for Firefox support
      await execCommand("brew", ["install", "nss"]);
    }

    // Install local CA
    log.info("Installing local certificate authority...");
    await execCommand("mkcert", ["-install"]);

    // Create SSL directory if it doesn't exist
    const sslDir = join(configDir, "ssl");
    await ensureDir(sslDir);

    // Generate certificates for the domain
    log.info(`Generating certificates for *.${domain} and ${domain}...`);
    await execCommand("mkcert", [
      "-cert-file",
      join(sslDir, `${domain}.crt`),
      "-key-file",
      join(sslDir, `${domain}.key`),
      `*.${domain}`,
      domain
    ]);

    log.success("Local certificates generated and trusted successfully.");
    return true;
  } catch (error) {
    log.error(
      `Failed to trust local certificates: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

// Create a simple setup script for future use
async function createSetupScript(): Promise<boolean> {
  log.step("Creating setup helper script...");

  try {
    const scriptPath = join(projectRoot, "setup.sh");
    const scriptContent = `#!/bin/bash
# Simple setup script for the project

# Run the project setup
bun run packages/cli/src/scripts/setup.ts

# Start the development server
echo "Setup complete! You can now run 'bun run dev' to start the development server."
`;

    await Bun.write(scriptPath, scriptContent);
    await execCommand("chmod", ["+x", scriptPath]);

    log.success(`Created setup script at ${scriptPath}`);
    return true;
  } catch (error) {
    log.error(
      `Failed to create setup script: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

// Main setup function
async function setup() {
  log.step("Starting cross-platform setup for Flexible Web...");

  // Get domain from .env or use default
  const domain = await getDomain();
  log.info(`Using domain: ${domain}`);

  // Update .env file with the domain
  await updateEnvFile(domain);

  // Install required dependencies
  if (!(await installDependencies())) {
    log.error("Failed to install required dependencies.");
    process.exit(1);
  }

  // Platform-specific configurations
  let useHttps = false;

  if (isMac) {
    // Configure dnsmasq on macOS
    if (!(await configureDnsmasq(domain))) {
      log.warning(
        "Failed to configure dnsmasq. Local DNS resolution may not work properly."
      );
    }

    // Trust local certificates on macOS
    if (await trustLocalCerts(domain)) {
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
  if (!(await configureCaddy(domain))) {
    log.error("Failed to configure Caddy.");
    process.exit(1);
  }

  // Create setup helper script
  await createSetupScript();

  // Start Caddy server
  if (!(await startCaddy())) {
    log.error("Failed to start Caddy server.");
    process.exit(1);
  }

  log.step("Setup completed successfully!");
  if (useHttps) {
    log.info(
      `You can now access your sites at https://${domain} and https://[site].${domain}`
    );
  } else {
    log.info(
      `You can now access your sites at http://${domain} and http://[site].${domain}`
    );
  }
  log.info('Run "bun run dev" to start the development server.');
}

// Run the setup
setup().catch((error) => {
  log.error(
    `Setup failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
