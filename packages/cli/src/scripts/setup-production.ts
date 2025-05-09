#!/usr/bin/env bun
// packages/cli/src/scripts/setup-production.ts

import { join, resolve } from "path";
import { homedir } from "os";
import {
  generateCaddyfileContent,
  discoverSites,
  type SiteConfig
} from "@dialup-deploy/core";

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
      const proc = Bun.spawn(["mkdir", "-p", dir], {
        stdio: ["inherit", "inherit", "inherit"]
      });
      await proc.exited;
    }
  } catch (error) {
    throw new Error(`Failed to create directory ${dir}: ${error}`);
  }
}

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

// Get domain from .env file or prompt user
async function getDomain(): Promise<string> {
  let domain = process.env.PROJECT_DOMAIN;

  if (!domain) {
    const envPath = join(projectRoot, ".env");
    if (await Bun.file(envPath).exists()) {
      const envContent = await Bun.file(envPath).text();
      const domainMatch = envContent.match(/PROJECT_DOMAIN=([^\s]+)/);
      if (domainMatch && domainMatch[1]) {
        domain = domainMatch[1];
      }
    }
  }

  if (!domain) {
    log.warning("PROJECT_DOMAIN not found in .env file.");
    log.info("Please enter your production domain (e.g., example.com):");

    // For simplicity, we'll use a default value
    // In a real implementation, you might want to add user input handling
    domain = "example.com";
    log.info(`Using default domain: ${domain}`);
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

// Install Caddy if not installed
async function installCaddy(): Promise<boolean> {
  log.step("Checking Caddy installation...");

  if (await commandExists("caddy")) {
    log.success("Caddy is already installed.");
    return true;
  }

  log.info("Installing Caddy...");

  try {
    if (isMac && (await commandExists("brew"))) {
      // Install via Homebrew on macOS
      const result = await execCommand("brew", ["install", "caddy"]);
      if (!result.success) return false;
    } else if (isLinux) {
      // Use Caddy's official installation method for Linux
      log.info(
        "Installing Caddy using the official Caddy installation script..."
      );
      const result = await execCommand("bash", [
        "-c",
        "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/setup.deb.sh' | sudo -E bash && sudo apt install caddy"
      ]);

      if (!result.success) {
        log.warning(
          "Official installation failed, trying alternative method..."
        );
        const altResult = await execCommand("bash", [
          "-c",
          "curl -sS https://webi.sh/caddy | sh"
        ]);
        if (!altResult.success) return false;

        // Update PATH for this process
        process.env.PATH = `${homedir()}/.local/bin:${process.env.PATH}`;
      }
    } else {
      log.error(
        "Automatic Caddy installation is not supported on this platform."
      );
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
    return true;
  } catch (error) {
    log.error(
      `Failed to install Caddy: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

// Configure Caddy for production
async function configureCaddyProduction(domain: string): Promise<boolean> {
  log.step(`Configuring Caddy for production with domain: ${domain}...`);

  try {
    // Generate the Caddyfile content using the shared utility
    const caddyfileContent = await generateCaddyfileContent(
      domain,
      join(projectRoot, "sites"),
      {
        info: log.info,
        warning: log.warning
      }
    );

    // Ensure config directory exists
    await ensureDir(configDir);

    // Write the Caddyfile to project config directory
    const caddyfilePath = join(configDir, "Caddyfile.production");
    await Bun.write(caddyfilePath, caddyfileContent);

    log.success(`Production Caddyfile created at ${caddyfilePath}`);

    // Create a symbolic link to make it easier to find
    const rootCaddyfilePath = join(projectRoot, "Caddyfile.production");
    try {
      await execCommand("ln", ["-sf", caddyfilePath, rootCaddyfilePath]);
      log.success(`Created symbolic link at ${rootCaddyfilePath}`);
    } catch (error) {
      log.warning(`Could not create symbolic link: ${error}`);
      // Continue anyway, this is not critical
    }

    // If on Linux, create a system Caddyfile
    if (isLinux) {
      try {
        // Create Caddy directory if it doesn't exist
        await execCommand("sudo", ["mkdir", "-p", "/etc/caddy"]);

        // Copy the Caddyfile to the system location
        await execCommand("sudo", [
          "cp",
          caddyfilePath,
          "/etc/caddy/Caddyfile"
        ]);
        log.success("Copied Caddyfile to /etc/caddy/Caddyfile");

        // Create log directory
        await execCommand("sudo", ["mkdir", "-p", "/var/log/caddy"]);
        await execCommand("sudo", [
          "chown",
          "-R",
          "caddy:caddy",
          "/var/log/caddy"
        ]);
        log.success("Created Caddy log directory");
      } catch (error) {
        log.warning(`Could not set up system Caddyfile: ${error}`);
        log.info(
          "You may need to manually copy the Caddyfile to /etc/caddy/Caddyfile"
        );
      }
    }

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

// Create a service file for the application
async function createServiceFile(
  domain: string,
  port: string = "3000"
): Promise<boolean> {
  log.step("Creating service file for the application...");

  const serviceContent = `[Unit]
Description=Flexible Web Server
After=network.target

[Service]
Type=simple
User=${process.env.USER || "root"}
WorkingDirectory=${projectRoot}
ExecStart=${process.argv[0]} packages/cli/src/index.ts start
Restart=always
Environment=PROJECT_DOMAIN=${domain}
Environment=PORT=${port}
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;

  try {
    const servicePath = join(configDir, "flexiweb.service");

    // Write the service file
    await Bun.write(servicePath, serviceContent);
    log.success(`Service file created at ${servicePath}`);

    // Create instructions for manual installation
    const instructionsPath = join(configDir, "service-installation.txt");
    const instructions = `To install the service on your system:

# For systemd-based systems (most Linux distributions):
sudo cp ${servicePath} /etc/systemd/system/flexiweb.service
sudo systemctl daemon-reload
sudo systemctl enable flexiweb
sudo systemctl start flexiweb

# To check status:
sudo systemctl status flexiweb

# For non-systemd systems or containers, you can use PM2:
npm install -g pm2
pm2 start ${process.argv[0]} --name flexiweb -- packages/cli/src/index.ts start
pm2 save
pm2 startup
`;

    await Bun.write(instructionsPath, instructions);
    log.success(
      `Service installation instructions created at ${instructionsPath}`
    );

    // If on Linux, try to install the service automatically
    if (isLinux) {
      try {
        log.info("Attempting to install the service automatically...");

        // Copy service file to system directory
        await execCommand("sudo", [
          "cp",
          servicePath,
          "/etc/systemd/system/flexiweb.service"
        ]);

        // Reload systemd
        await execCommand("sudo", ["systemctl", "daemon-reload"]);

        // Enable the service
        await execCommand("sudo", ["systemctl", "enable", "flexiweb"]);

        log.success(
          "Service installed successfully. You can start it with: sudo systemctl start flexiweb"
        );
      } catch (error) {
        log.warning(`Could not install service automatically: ${error}`);
        log.info(
          `Please follow the instructions in ${instructionsPath} to install the service manually.`
        );
      }
    }

    return true;
  } catch (error) {
    log.error(
      `Failed to create service file: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

// Create a startup script for manual launching
async function createStartupScript(domain: string): Promise<boolean> {
  log.step("Creating startup script...");

  const scriptContent = `#!/bin/bash
# Startup script for Flexible Web
# -----------------------------

# Load environment variables if .env exists
if [ -f "${join(projectRoot, ".env")}" ]; then
  export $(cat "${join(projectRoot, ".env")}" | grep -v '^#' | xargs)
fi

# Set default environment variables
export NODE_ENV=production
export PROJECT_DOMAIN=${domain}
export PORT=3000

# Start Caddy if it exists
if command -v caddy &> /dev/null; then
  echo "Starting Caddy server..."
  
  # Check if running as root (for port 80/443 binding)
  if [ "$EUID" -eq 0 ]; then
    # Running as root, use system Caddyfile if available
    if [ -f "/etc/caddy/Caddyfile" ]; then
      caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
    else
      caddy run --config "${join(
        configDir,
        "Caddyfile.production"
      )}" --adapter caddyfile &
    fi
  else
    # Not running as root, use project Caddyfile
    caddy run --config "${join(
      configDir,
      "Caddyfile.production"
    )}" --adapter caddyfile &
  fi
  
  CADDY_PID=$!
  echo "Caddy started with PID: $CADDY_PID"
else
  echo "Caddy not found. Skipping Caddy startup."
  echo "You may need to start Caddy separately with root privileges for ports 80/443."
fi

# Start the application
echo "Starting Flexible Web application..."
${process.argv[0]} packages/cli/src/index.ts start

# If this script is terminated, stop Caddy
trap "kill $CADDY_PID 2>/dev/null" EXIT

# Wait for any background processes
wait
`;

  try {
    const scriptPath = join(projectRoot, "start.sh");

    // Write the script
    await Bun.write(scriptPath, scriptContent);

    // Make it executable
    await execCommand("chmod", ["+x", scriptPath]);

    log.success(`Startup script created at ${scriptPath}`);
    return true;
  } catch (error) {
    log.error(
      `Failed to create startup script: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

// Create a quick setup script for new Ubuntu droplets
async function createQuickSetupScript(domain: string): Promise<boolean> {
  log.step("Creating quick setup script for new Ubuntu droplets...");

  const scriptContent = `#!/bin/bash
# Quick setup script for Flexible Web on a new Ubuntu droplet
# ----------------------------------------------------------

# Exit on error
set -e

echo "==> Installing dependencies..."
sudo apt update
sudo apt install -y curl unzip git

# Install Bun
echo "==> Installing Bun..."
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Install Caddy
echo "==> Installing Caddy..."
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/setup.deb.sh' | sudo -E bash
sudo apt install -y caddy

# Clone the repository (replace with your actual repository)
echo "==> Cloning the repository..."
git clone https://github.com/yourusername/your-repo.git
cd your-repo

# Create .env file
echo "==> Creating .env file..."
cat > .env << EOL
PROJECT_DOMAIN=${domain}
NODE_ENV=production
PORT=3000
EOL

# Install dependencies
echo "==> Installing dependencies..."
bun install

# Run the production setup
echo "==> Running production setup..."
bun run packages/cli/src/scripts/setup-production.ts

# Start the service
echo "==> Starting the service..."
sudo systemctl start flexiweb

echo "==> Setup complete!"
echo "Your site should now be accessible at https://${domain}"
echo "Make sure your DNS is configured correctly:"
echo "- A record for ${domain} pointing to this server's IP"
echo "- Wildcard CNAME record for *.${domain} pointing to ${domain}"
`;

  try {
    const scriptPath = join(projectRoot, "quick-setup.sh");

    // Write the script
    await Bun.write(scriptPath, scriptContent);

    // Make it executable
    await execCommand("chmod", ["+x", scriptPath]);

    log.success(`Quick setup script created at ${scriptPath}`);
    return true;
  } catch (error) {
    log.error(
      `Failed to create quick setup script: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

// Configure firewall (for Linux)
async function configureFirewall(): Promise<boolean> {
  if (!isLinux) return true; // Skip on non-Linux platforms

  log.step("Configuring firewall...");

  try {
    // Check if ufw is installed
    if (await commandExists("ufw")) {
      // Allow HTTP and HTTPS
      await execCommand("sudo", ["ufw", "allow", "http"]);
      await execCommand("sudo", ["ufw", "allow", "https"]);

      // Allow SSH (to prevent lockout)
      await execCommand("sudo", ["ufw", "allow", "ssh"]);

      // Check if ufw is enabled
      const statusResult = await execCommand("sudo", ["ufw", "status"]);
      if (statusResult.output.includes("inactive")) {
        // Enable ufw
        log.info("Enabling firewall...");
        await execCommand("sudo", ["ufw", "--force", "enable"]);
      }

      log.success("Firewall configured successfully.");
    } else {
      log.info("ufw not found. Skipping firewall configuration.");
    }

    return true;
  } catch (error) {
    log.warning(
      `Failed to configure firewall: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    log.info("You may need to configure your firewall manually.");
    return false;
  }
}

// Main setup function
async function setup() {
  log.step("Starting production setup for Flexible Web...");

  // Get domain from .env or prompt user
  const domain = await getDomain();
  log.info(`Using domain: ${domain}`);

  // Update .env file with the domain
  await updateEnvFile(domain);

  // Create necessary directories
  await ensureDir(configDir);

  // Install Caddy if not present
  if (!(await installCaddy())) {
    log.error("Failed to install Caddy. Please install it manually.");
    log.info("Continuing setup without Caddy...");
  }

  // Configure Caddy for production
  if (!(await configureCaddyProduction(domain))) {
    log.error("Failed to configure Caddy for production.");
    log.info("You can configure Caddy manually later if needed.");
  }

  // Create service file for systemd or other service managers
  if (!(await createServiceFile(domain))) {
    log.warning("Failed to create service file.");
  }

  // Create a manual startup script
  if (!(await createStartupScript(domain))) {
    log.warning("Failed to create startup script.");
  }

  // Create a quick setup script for new Ubuntu droplets
  if (!(await createQuickSetupScript(domain))) {
    log.warning("Failed to create quick setup script.");
  }

  // Configure firewall on Linux
  if (isLinux) {
    await configureFirewall();
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
      const subdomain = site.subdomain || site.route.replace(/^\//, "");
      log.info(`- https://${subdomain}.${domain} (${site.type} site)`);
    }
  } catch (error) {
    // Ignore errors discovering sites
  }

  log.info("");
  log.info("For a new Ubuntu droplet, you can use the quick-setup.sh script");
  log.info("to set up everything in one go.");
  log.info("");
  log.info("Happy deploying!");

  process.exit(0);
}

// Run the setup
setup().catch((error) => {
  log.error(
    `Setup failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
