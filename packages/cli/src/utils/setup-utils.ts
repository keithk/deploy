
import { join, resolve } from "path";
import { homedir } from "os";
import { generateCaddyfileContent } from "@dialup-deploy/core";

// Type for log functions
type LogFunctions = {
  info: (message: string) => void;
  success: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
  step: (message: string) => void;
};

// Platform detection
const platform = process.platform;
const isLinux = platform === "linux";
const isMac = platform === "darwin";

/**
 * Check if a command exists
 */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", command], {
      stdio: ["ignore", "ignore", "ignore"]
    });
    return (await proc.exited) === 0;
  } catch (error) {
    return false;
  }
}

/**
 * Ensure directory exists
 */
export async function ensureDir(dir: string): Promise<void> {
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

/**
 * Execute a command and return the result
 */
export async function execCommand(
  command: string,
  args: string[] = [],
  options: any = {},
  log?: LogFunctions
): Promise<{ success: boolean; output: string }> {
  if (log) {
    log.info(`Executing: ${command} ${args.join(" ")}`);
  } else {
    console.log(`Executing: ${command} ${args.join(" ")}`);
  }

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
      if (log) {
        log.error(`Command exited with code ${exitCode}`);
        if (errorOutput) log.error(errorOutput);
      } else {
        console.error(`Command exited with code ${exitCode}`);
        if (errorOutput) console.error(errorOutput);
      }
      return { success: false, output: errorOutput };
    }

    return { success: true, output };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (log) {
      log.error(`Command failed: ${errorMessage}`);
    } else {
      console.error(`Command failed: ${errorMessage}`);
    }
    return { success: false, output: String(error) };
  }
}

/**
 * Update or create .env file with PROJECT_DOMAIN
 */
export async function updateEnvFile(
  domain: string,
  projectRoot: string
): Promise<boolean> {
  console.log(`Updating .env file with PROJECT_DOMAIN=${domain}...`);

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
    console.log(`Updated .env file with PROJECT_DOMAIN=${domain}`);
    return true;
  } catch (error) {
    console.error(
      `Failed to update .env file: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

/**
 * Install Caddy if not installed
 */
export async function installCaddy(log: LogFunctions): Promise<boolean> {
  log.step("Checking Caddy installation...");

  if (await commandExists("caddy")) {
    log.success("Caddy is already installed.");
    return true;
  }

  log.info("Installing Caddy...");

  try {
    if (isMac && (await commandExists("brew"))) {
      // Install via Homebrew on macOS
      const result = await execCommand("brew", ["install", "caddy"], {}, log);
      if (!result.success) return false;
    } else if (isLinux) {
      // Use Caddy's official installation method for Linux
      log.info(
        "Installing Caddy using the official Caddy installation script..."
      );
      const result = await execCommand(
        "bash",
        [
          "-c",
          "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/setup.deb.sh' | sudo -E bash && sudo apt install caddy"
        ],
        {},
        log
      );

      if (!result.success) {
        log.warning(
          "Official installation failed, trying alternative method..."
        );
        const altResult = await execCommand(
          "bash",
          ["-c", "curl -sS https://webi.sh/caddy | sh"],
          {},
          log
        );
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

/**
 * Configure dnsmasq (macOS only)
 */
export async function configureDnsmasq(
  domain: string,
  log: LogFunctions
): Promise<boolean> {
  if (!isMac) return true; // Skip on non-macOS platforms

  log.step("Configuring dnsmasq...");

  const dnsmasqConfDir = "/opt/homebrew/etc";
  const dnsmasqEntry = `address=/.${domain}/127.0.0.1`;

  try {
    // Check if dnsmasq is installed
    if (!(await commandExists("dnsmasq"))) {
      log.info("dnsmasq not found. Installing...");
      if (await commandExists("brew")) {
        await execCommand("brew", ["install", "dnsmasq"], {}, log);
      } else {
        log.error("Homebrew not found. Please install Homebrew first.");
        log.info("https://brew.sh/");
        return false;
      }
    }

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
    await execCommand(
      "bash",
      ["-c", `echo "${dnsmasqEntry}" | sudo tee -a ${systemConfPath}`],
      {},
      log
    );

    // Create resolver directory if it doesn't exist
    await execCommand("sudo", ["mkdir", "-p", "/etc/resolver"], {}, log);

    // Create resolver file for the domain
    await execCommand(
      "bash",
      ["-c", `echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/${domain}`],
      {},
      log
    );

    // Restart dnsmasq
    await execCommand(
      "sudo",
      ["brew", "services", "restart", "dnsmasq"],
      {},
      log
    );

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

/**
 * Trust local HTTPS certificates (macOS only)
 */
export async function trustLocalCerts(
  domain: string,
  configDir: string,
  log: LogFunctions
): Promise<boolean> {
  if (!isMac) return true; // Skip on non-macOS platforms

  log.step("Setting up local HTTPS certificates...");

  try {
    // For macOS, we'll use mkcert to create and trust local certificates
    if (!(await commandExists("mkcert"))) {
      log.info("Installing mkcert...");
      await execCommand("brew", ["install", "mkcert"], {}, log);

      // Also install nss for Firefox support
      await execCommand("brew", ["install", "nss"], {}, log);
    }

    // Install local CA
    log.info("Installing local certificate authority...");
    await execCommand("mkcert", ["-install"], {}, log);

    // Create SSL directory if it doesn't exist
    const sslDir = join(configDir, "ssl");
    await ensureDir(sslDir);

    // Generate certificates for the domain
    log.info(`Generating certificates for *.${domain} and ${domain}...`);
    await execCommand(
      "mkcert",
      [
        "-cert-file",
        join(sslDir, `${domain}.crt`),
        "-key-file",
        join(sslDir, `${domain}.key`),
        `*.${domain}`,
        domain
      ],
      {},
      log
    );

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

/**
 * Configure Caddy for local development
 */
export async function configureCaddy(
  domain: string,
  projectRoot: string,
  configDir: string,
  useHttps: boolean,
  log: LogFunctions
): Promise<boolean> {
  log.step("Configuring Caddy...");

  try {
    // Ensure config directory exists
    await ensureDir(configDir);

    // Also ensure ssl directory exists for certificates
    const sslDir = join(configDir, "ssl");
    await ensureDir(sslDir);

    // Ensure caddy-data directory exists
    const caddyDataDir = join(configDir, "caddy-data");
    await ensureDir(caddyDataDir);

    // For local development, we'll create a custom Caddyfile with local_certs
    // and wildcard domain configuration
    let caddyfileContent = "";

    // Add global configuration
    caddyfileContent += `{
  # Use project directory for storage
  storage file_system {
    root ${caddyDataDir}
  }

  # Use local certificates
  local_certs
  
  # Log to console for debugging
  debug
}\n\n`;

    if (useHttps) {
      // Add HTTPS configuration with wildcard domain
      caddyfileContent += `https://*.${domain}, https://${domain} {
  reverse_proxy localhost:3000
}\n`;
    } else {
      // Add HTTP configuration with wildcard domain and auto_https off
      caddyfileContent += `http://*.${domain}, http://${domain} {
  auto_https off
  reverse_proxy localhost:3000
}\n`;
    }

    // Write the Caddyfile to the project config directory
    const caddyfilePath = join(configDir, "Caddyfile");
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

/**
 * Configure Caddy for production
 */
export async function configureCaddyProduction(
  domain: string,
  projectRoot: string,
  configDir: string,
  log: LogFunctions
): Promise<boolean> {
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
      await execCommand(
        "ln",
        ["-sf", caddyfilePath, rootCaddyfilePath],
        {},
        log
      );
      log.success(`Created symbolic link at ${rootCaddyfilePath}`);
    } catch (error) {
      log.warning(`Could not create symbolic link: ${error}`);
      // Continue anyway, this is not critical
    }

    // If on Linux, create a system Caddyfile
    if (isLinux) {
      try {
        // Create Caddy directory if it doesn't exist
        await execCommand("sudo", ["mkdir", "-p", "/etc/caddy"], {}, log);

        // Copy the Caddyfile to the system location
        await execCommand(
          "sudo",
          ["cp", caddyfilePath, "/etc/caddy/Caddyfile"],
          {},
          log
        );
        log.success("Copied Caddyfile to /etc/caddy/Caddyfile");

        // Create log directory
        await execCommand("sudo", ["mkdir", "-p", "/var/log/caddy"], {}, log);
        await execCommand(
          "sudo",
          ["chown", "-R", "caddy:caddy", "/var/log/caddy"],
          {},
          log
        );
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

/**
 * Create a service file for the application
 */
export async function createServiceFile(
  domain: string,
  projectRoot: string,
  configDir: string,
  log: LogFunctions,
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
        await execCommand(
          "sudo",
          ["cp", servicePath, "/etc/systemd/system/flexiweb.service"],
          {},
          log
        );

        // Reload systemd
        await execCommand("sudo", ["systemctl", "daemon-reload"], {}, log);

        // Enable the service
        await execCommand("sudo", ["systemctl", "enable", "flexiweb"], {}, log);

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

/**
 * Create a startup script for manual launching
 */
export async function createStartupScript(
  domain: string,
  projectRoot: string,
  configDir: string,
  log: LogFunctions
): Promise<boolean> {
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
    await execCommand("chmod", ["+x", scriptPath], {}, log);

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

/**
 * Create a quick setup script for new Ubuntu droplets
 */
export async function createQuickSetupScript(
  domain: string,
  projectRoot: string,
  log: LogFunctions
): Promise<boolean> {
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
bun run packages/cli/src/index.ts setup production

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
    await execCommand("chmod", ["+x", scriptPath], {}, log);

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

/**
 * Configure firewall (for Linux)
 */
export async function configureFirewall(log: LogFunctions): Promise<boolean> {
  if (!isLinux) return true; // Skip on non-Linux platforms

  log.step("Configuring firewall...");

  try {
    // Check if ufw is installed
    if (await commandExists("ufw")) {
      // Allow HTTP and HTTPS
      await execCommand("sudo", ["ufw", "allow", "http"], {}, log);
      await execCommand("sudo", ["ufw", "allow", "https"], {}, log);

      // Allow SSH (to prevent lockout)
      await execCommand("sudo", ["ufw", "allow", "ssh"], {}, log);

      // Check if ufw is enabled
      const statusResult = await execCommand(
        "sudo",
        ["ufw", "status"],
        {},
        log
      );
      if (statusResult.output.includes("inactive")) {
        // Enable ufw
        log.info("Enabling firewall...");
        await execCommand("sudo", ["ufw", "--force", "enable"], {}, log);
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
