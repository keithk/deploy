
import { join, resolve } from "path";
import { homedir } from "os";
import { generateCaddyfileContent } from "../../core";
import { DEPLOY_PATHS, getSSLPaths, ensureDeployDir } from "../../core/config/paths";

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
 * Install Docker if not installed
 */
export async function installDocker(log: LogFunctions): Promise<boolean> {
  log.step("Checking Docker installation...");

  if (await commandExists("docker")) {
    log.success("Docker is already installed.");
    return await verifyDockerSetup(log);
  }

  log.info("Installing Docker...");

  try {
    if (isMac) {
      // On macOS, we need Docker Desktop
      log.info("Docker installation on macOS requires Docker Desktop.");
      log.info("Please install Docker Desktop from: https://www.docker.com/products/docker-desktop/");
      log.warning("After installing Docker Desktop, please restart this setup.");
      return false;
    } else if (isLinux) {
      // Install Docker on Linux
      log.info("Installing Docker using the official installation script...");
      
      // Install using Docker's convenience script
      const result = await execCommand(
        "bash",
        ["-c", "curl -fsSL https://get.docker.com | sh"],
        {},
        log
      );
      
      if (!result.success) {
        log.error("Docker installation failed");
        return false;
      }
      
      // Add current user to docker group
      log.info("Adding current user to docker group...");
      await execCommand("sudo", ["usermod", "-aG", "docker", process.env.USER || "$USER"], {}, log);
      
      // Start and enable Docker service
      await execCommand("sudo", ["systemctl", "start", "docker"], {}, log);
      await execCommand("sudo", ["systemctl", "enable", "docker"], {}, log);
      
      log.warning("Please log out and back in for Docker group membership to take effect.");
    } else {
      log.error("Automatic Docker installation is not supported on this platform.");
      log.info("Please install Docker manually: https://docs.docker.com/get-docker/");
      return false;
    }

    // Verify installation
    if (!(await commandExists("docker"))) {
      log.error("Docker installation verification failed.");
      return false;
    }

    log.success("Docker installed successfully.");
    return await verifyDockerSetup(log);
  } catch (error) {
    log.error(
      `Failed to install Docker: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

/**
 * Verify Docker is properly set up
 */
export async function verifyDockerSetup(log: LogFunctions): Promise<boolean> {
  try {
    // Check if Docker daemon is running
    const result = await execCommand("docker", ["info"], {}, log);
    if (!result.success) {
      log.error("Docker daemon is not running. Please start Docker.");
      if (isMac) {
        log.info("Start Docker Desktop application.");
      } else if (isLinux) {
        log.info("Run: sudo systemctl start docker");
      }
      return false;
    }
    
    // Check if buildx is available (needed for Railpacks)
    const buildxResult = await execCommand("docker", ["buildx", "version"], {}, log);
    if (!buildxResult.success) {
      log.warning("Docker Buildx not available. Installing...");
      // Buildx should be included in modern Docker, but let's enable it
      await execCommand("docker", ["buildx", "install"], {}, log);
    }
    
    log.success("Docker is properly configured.");
    return true;
  } catch (error) {
    log.error(`Docker verification failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Install Mise if not installed
 */
export async function installMise(log: LogFunctions): Promise<boolean> {
  log.step("Checking Mise installation...");

  if (await commandExists("mise")) {
    log.success("Mise is already installed.");
    return true;
  }

  log.info("Installing Mise...");

  try {
    if (isMac && (await commandExists("brew"))) {
      // Install via Homebrew on macOS
      const result = await execCommand("brew", ["install", "mise"], {}, log);
      if (!result.success) return false;
    } else {
      // Use Mise's official installation script
      log.info("Installing Mise using the official installation script...");
      const result = await execCommand(
        "bash",
        ["-c", "curl https://mise.run | sh"],
        {},
        log
      );
      if (!result.success) return false;
      
      // Update PATH for this process
      process.env.PATH = `${process.env.HOME}/.local/bin:${process.env.PATH}`;
    }

    // Verify installation
    if (!(await commandExists("mise"))) {
      log.error("Mise installation verification failed.");
      return false;
    }

    log.success("Mise installed successfully.");
    return true;
  } catch (error) {
    log.error(
      `Failed to install Mise: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

/**
 * Install Railpacks if not installed
 */
export async function installRailpacks(log: LogFunctions): Promise<boolean> {
  log.step("Checking Railpacks installation...");

  if (await commandExists("railpacks")) {
    log.success("Railpacks is already installed.");
    return true;
  }

  log.info("Installing Railpacks...");

  try {
    // Install Railpacks using cargo (Rust package manager)
    // First check if cargo is available
    if (!(await commandExists("cargo"))) {
      log.info("Cargo not found. Installing Rust toolchain...");
      
      // Install Rust
      const rustResult = await execCommand(
        "bash",
        ["-c", "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"],
        {},
        log
      );
      
      if (!rustResult.success) {
        log.error("Failed to install Rust toolchain");
        return false;
      }
      
      // Source the cargo environment
      process.env.PATH = `${process.env.HOME}/.cargo/bin:${process.env.PATH}`;
      
      // Verify cargo is now available
      if (!(await commandExists("cargo"))) {
        log.error("Cargo installation verification failed. Please restart your shell and try again.");
        return false;
      }
    }
    
    // Install Railpacks via cargo
    const result = await execCommand(
      "cargo",
      ["install", "railpacks"],
      {},
      log
    );
    
    if (!result.success) {
      log.error("Railpacks installation failed");
      return false;
    }
    
    // Update PATH to include cargo bin
    process.env.PATH = `${process.env.HOME}/.cargo/bin:${process.env.PATH}`;

    // Verify installation
    if (!(await commandExists("railpacks"))) {
      log.error("Railpacks installation verification failed.");
      log.info("You may need to restart your shell or add ~/.cargo/bin to your PATH");
      return false;
    }

    log.success("Railpacks installed successfully.");
    return true;
  } catch (error) {
    log.error(
      `Failed to install Railpacks: ${
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
 * Check if dnsmasq is running
 */
export async function isDnsmasqRunning(): Promise<boolean> {
  if (!isMac) return true; // Skip on non-macOS platforms
  
  try {
    // First check brew services
    const brewProc = Bun.spawn(["brew", "services", "list"], {
      stdio: ["ignore", "pipe", "ignore"]
    });
    const brewOutput = await new Response(brewProc.stdout).text();
    const brewExitCode = await brewProc.exited;

    if (brewExitCode === 0 && brewOutput.includes("dnsmasq") && brewOutput.includes("started")) {
      return true;
    }

    // Also check for dnsmasq process directly (in case it's running manually)
    const pgrep = Bun.spawn(["pgrep", "dnsmasq"], {
      stdio: ["ignore", "pipe", "ignore"]
    });
    const pgrepExitCode = await pgrep.exited;
    
    return pgrepExitCode === 0; // pgrep returns 0 if process found
  } catch (error) {
    return false;
  }
}

/**
 * Start dnsmasq service
 */
export async function startDnsmasq(log: LogFunctions): Promise<boolean> {
  if (!isMac) return true; // Skip on non-macOS platforms

  try {
    if (await isDnsmasqRunning()) {
      log.info("dnsmasq is already running");
      return true;
    }

    log.info("Starting dnsmasq service...");
    const result = await execCommand("brew", ["services", "start", "dnsmasq"], {}, log);
    
    if (result.success) {
      log.success("dnsmasq started successfully");
      return true;
    } else {
      log.error("Failed to start dnsmasq");
      return false;
    }
  } catch (error) {
    log.error(`Failed to start dnsmasq: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Ensure dnsmasq is running, show warning and instructions if not
 */
export async function ensureDnsmasqRunning(domain: string, log: LogFunctions): Promise<boolean> {
  if (!isMac) return true; // Skip on non-macOS platforms

  // Check if dnsmasq is already running
  if (await isDnsmasqRunning()) {
    log.success(`dnsmasq is running and configured for .${domain} domains`);
    return true;
  }

  // Check if dnsmasq is installed
  if (!(await commandExists("dnsmasq"))) {
    log.warning("⚠️  dnsmasq is not installed");
    log.info("To install dnsmasq and enable local domain resolution:");
    log.info("  brew install dnsmasq");
    log.info("  sudo brew services start dnsmasq");
    return false;
  }

  // dnsmasq is installed but not running
  log.warning("⚠️  dnsmasq is installed but not running");
  log.info("To start dnsmasq and enable local domain resolution:");
  log.info(`  sudo brew services start dnsmasq`);
  log.info("");
  log.info("This will allow you to access sites via https://yoursite.${domain}");
  log.info("Without dnsmasq, you'll need to use localhost:port URLs instead");
  
  // Still try to configure it in case it's not configured
  await configureDnsmasq(domain, log);
  
  return false; // Return false since it's not running
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

    // If configuration is missing, show manual instructions
    log.warning("dnsmasq configuration is incomplete");
    log.info("To complete dnsmasq configuration for local domain resolution, run:");
    log.info(`  echo "${dnsmasqEntry}" | sudo tee -a ${systemConfPath}`);
    log.info(`  sudo mkdir -p /etc/resolver`);
    log.info(`  echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/${domain}`);
    log.info(`  sudo brew services restart dnsmasq`);
    
    return false; // Configuration is incomplete
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

    // Use the new SSL directory structure
    const sslPaths = getSSLPaths(domain, false); // false = development
    await ensureDeployDir(sslPaths.dir);

    // Generate certificates for the domain
    log.info(`Generating certificates for *.${domain} and ${domain}...`);
    await execCommand(
      "mkcert",
      [
        "-cert-file",
        sslPaths.certFile,
        "-key-file",
        sslPaths.keyFile,
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
    // Ensure new directory structure exists
    await ensureDeployDir(DEPLOY_PATHS.caddyDir);
    await ensureDeployDir(DEPLOY_PATHS.caddyData);
    await ensureDeployDir(getSSLPaths(domain, false).dir);

    // For local development, we'll create a custom Caddyfile with local_certs
    // and wildcard domain configuration
    let caddyfileContent = "";

    // Add global configuration
    caddyfileContent += `{
  # Use project directory for storage
  storage file_system {
    root ${DEPLOY_PATHS.caddyData}
  }

  # Use local certificates
  local_certs
  
  # Log to console for debugging
  debug
}\n\n`;

    if (useHttps) {
      // Add HTTPS configuration with wildcard domain using new SSL paths
      const sslPaths = getSSLPaths(domain, false);
      caddyfileContent += `https://*.${domain}, https://${domain} {
  tls ${sslPaths.certFile} ${sslPaths.keyFile}
  reverse_proxy localhost:3000
}\n`;
    } else {
      // Add HTTP configuration with wildcard domain and auto_https off
      caddyfileContent += `http://*.${domain}, http://${domain} {
  auto_https off
  reverse_proxy localhost:3000
}\n`;
    }

    // Write the Caddyfile to the new location
    const caddyfilePath = DEPLOY_PATHS.caddyfile;
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

    // Ensure new directory structure exists
    await ensureDeployDir(DEPLOY_PATHS.caddyDir);

    // Write the Caddyfile to the new location
    const caddyfilePath = DEPLOY_PATHS.caddyfileProduction;
    await Bun.write(caddyfilePath, caddyfileContent);

    log.success(`Production Caddyfile created at ${caddyfilePath}`);

    // Create a symbolic link in the root for backwards compatibility
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

/**
 * Verify all tools are installed and working
 */
export async function verifyInstallation(log: LogFunctions): Promise<boolean> {
  log.step("Verifying installation...");
  
  const tools = [
    { name: "Bun", command: "bun", versionArg: "--version" },
    { name: "Docker", command: "docker", versionArg: "--version" },
    { name: "Mise", command: "mise", versionArg: "--version" },
    { name: "Railpacks", command: "railpacks", versionArg: "--version" },
    { name: "Caddy", command: "caddy", versionArg: "version" }
  ];
  
  let allGood = true;
  
  for (const tool of tools) {
    if (await commandExists(tool.command)) {
      try {
        const result = await execCommand(tool.command, [tool.versionArg], {}, log);
        if (result.success) {
          log.success(`${tool.name} is working correctly`);
        } else {
          log.warning(`${tool.name} is installed but may have issues`);
          allGood = false;
        }
      } catch (error) {
        log.error(`${tool.name} verification failed: ${error instanceof Error ? error.message : String(error)}`);
        allGood = false;
      }
    } else {
      log.warning(`${tool.name} is not installed`);
      if (tool.command === "docker" || tool.command === "bun") {
        allGood = false; // These are critical
      }
    }
  }
  
  // Special check for Docker daemon
  if (await commandExists("docker")) {
    if (!(await verifyDockerSetup(log))) {
      allGood = false;
    }
  }
  
  return allGood;
}

/**
 * Show post-installation instructions
 */
export async function showPostInstallInstructions(domain: string, useHttps: boolean, log: LogFunctions): Promise<void> {
  log.step("Post-installation instructions");
  
  console.log(`\n${colors.green}🎉 Deploy setup completed successfully!${colors.reset}\n`);
  
  console.log(`${colors.cyan}Next steps:${colors.reset}`);
  console.log(`1. Start the development server: ${colors.yellow}bun run dev${colors.reset}`);
  console.log(`2. Access your sites at: ${colors.yellow}${useHttps ? 'https' : 'http'}://${domain}${colors.reset}`);
  console.log(`3. Create your first site: ${colors.yellow}deploy site create my-site${colors.reset}`);
  
  console.log(`\n${colors.cyan}Useful commands:${colors.reset}`);
  console.log(`• Check system health: ${colors.yellow}deploy doctor${colors.reset}`);
  console.log(`• View running processes: ${colors.yellow}deploy processes${colors.reset}`);
  console.log(`• Manage sites: ${colors.yellow}deploy site --help${colors.reset}`);
  
  if (isMac && !(await isDnsmasqRunning())) {
    console.log(`\n${colors.yellow}⚠️  Note: Local DNS is not configured${colors.reset}`);
    console.log(`To access sites via ${domain} domains, configure dnsmasq:`);
    console.log(`${colors.blue}brew services start dnsmasq${colors.reset}`);
  }
  
  console.log(`\nFor more information, visit: ${colors.blue}https://github.com/dialupdotcom/deploy${colors.reset}`);
}
