import { Command } from "commander";
import { join } from "path";
import { commandExists, execCommand } from "../utils/setup-utils";

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

interface DiagnosticResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  fixCommand?: string;
}

/**
 * Check if Bun is installed and working
 */
async function checkBun(): Promise<DiagnosticResult> {
  if (!(await commandExists("bun"))) {
    return {
      name: "Bun Runtime",
      status: 'fail',
      message: "Bun is not installed",
      fixCommand: "curl -fsSL https://bun.sh/install | bash"
    };
  }

  try {
    const result = await execCommand("bun", ["--version"]);
    if (result.success) {
      const version = result.output.trim();
      return {
        name: "Bun Runtime",
        status: 'pass',
        message: `Bun ${version} is installed and working`
      };
    } else {
      return {
        name: "Bun Runtime",
        status: 'fail',
        message: "Bun is installed but not working properly"
      };
    }
  } catch (error) {
    return {
      name: "Bun Runtime",
      status: 'fail',
      message: `Bun check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check if Docker is installed and running
 */
async function checkDocker(): Promise<DiagnosticResult> {
  if (!(await commandExists("docker"))) {
    return {
      name: "Docker",
      status: 'fail',
      message: "Docker is not installed",
      fixCommand: isMac 
        ? "Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
        : "curl -fsSL https://get.docker.com | sh"
    };
  }

  try {
    // Check if Docker daemon is running
    const result = await execCommand("docker", ["info"]);
    if (result.success) {
      // Extract Docker version
      const versionResult = await execCommand("docker", ["--version"]);
      const version = versionResult.output.split(" ")[2]?.replace(",", "") || "unknown";
      return {
        name: "Docker",
        status: 'pass',
        message: `Docker ${version} is installed and running`
      };
    } else {
      return {
        name: "Docker",
        status: 'fail',
        message: "Docker is installed but daemon is not running",
        fixCommand: isMac 
          ? "Start Docker Desktop application"
          : "sudo systemctl start docker"
      };
    }
  } catch (error) {
    return {
      name: "Docker",
      status: 'fail',
      message: `Docker check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check if Docker Buildx is available
 */
async function checkDockerBuildx(): Promise<DiagnosticResult> {
  if (!(await commandExists("docker"))) {
    return {
      name: "Docker Buildx",
      status: 'fail',
      message: "Docker is not installed"
    };
  }

  try {
    const result = await execCommand("docker", ["buildx", "version"]);
    if (result.success) {
      const version = result.output.split(" ")[1] || "unknown";
      return {
        name: "Docker Buildx",
        status: 'pass',
        message: `Docker Buildx ${version} is available`
      };
    } else {
      return {
        name: "Docker Buildx",
        status: 'fail',
        message: "Docker Buildx is not available",
        fixCommand: "docker buildx install"
      };
    }
  } catch (error) {
    return {
      name: "Docker Buildx",
      status: 'fail',
      message: `Docker Buildx check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check if Railpacks is installed
 */
async function checkRailpacks(): Promise<DiagnosticResult> {
  if (!(await commandExists("railpacks"))) {
    return {
      name: "Railpacks",
      status: 'fail',
      message: "Railpacks is not installed",
      fixCommand: "cargo install railpacks (requires Rust toolchain)"
    };
  }

  try {
    const result = await execCommand("railpacks", ["--version"]);
    if (result.success) {
      const version = result.output.trim();
      return {
        name: "Railpacks",
        status: 'pass',
        message: `Railpacks ${version} is installed`
      };
    } else {
      return {
        name: "Railpacks",
        status: 'fail',
        message: "Railpacks is installed but not working properly"
      };
    }
  } catch (error) {
    return {
      name: "Railpacks",
      status: 'fail',
      message: `Railpacks check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check if Mise is installed
 */
async function checkMise(): Promise<DiagnosticResult> {
  if (!(await commandExists("mise"))) {
    return {
      name: "Mise",
      status: 'fail',
      message: "Mise is not installed",
      fixCommand: "curl https://mise.run | sh"
    };
  }

  try {
    const result = await execCommand("mise", ["--version"]);
    if (result.success) {
      const version = result.output.trim();
      return {
        name: "Mise",
        status: 'pass',
        message: `Mise ${version} is installed`
      };
    } else {
      return {
        name: "Mise",
        status: 'fail',
        message: "Mise is installed but not working properly"
      };
    }
  } catch (error) {
    return {
      name: "Mise",
      status: 'fail',
      message: `Mise check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check if Caddy is installed
 */
async function checkCaddy(): Promise<DiagnosticResult> {
  if (!(await commandExists("caddy"))) {
    return {
      name: "Caddy",
      status: 'warning',
      message: "Caddy is not installed (will be installed during setup)",
      fixCommand: isMac ? "brew install caddy" : "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/setup.deb.sh' | sudo -E bash && sudo apt install caddy"
    };
  }

  try {
    const result = await execCommand("caddy", ["version"]);
    if (result.success) {
      const version = result.output.split(" ")[0] || "unknown";
      return {
        name: "Caddy",
        status: 'pass',
        message: `Caddy ${version} is installed`
      };
    } else {
      return {
        name: "Caddy",
        status: 'fail',
        message: "Caddy is installed but not working properly"
      };
    }
  } catch (error) {
    return {
      name: "Caddy",
      status: 'fail',
      message: `Caddy check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check system requirements
 */
async function checkSystemRequirements(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  // Check platform support
  if (isMac || isLinux) {
    results.push({
      name: "Operating System",
      status: 'pass',
      message: `${isMac ? 'macOS' : 'Linux'} is supported`
    });
  } else {
    results.push({
      name: "Operating System", 
      status: 'warning',
      message: `${platform} support is experimental`
    });
  }

  // Check if running with proper permissions
  const isRoot = process.getuid && process.getuid() === 0;
  if (isRoot) {
    results.push({
      name: "User Permissions",
      status: 'warning', 
      message: "Running as root - this may cause permission issues"
    });
  } else {
    results.push({
      name: "User Permissions",
      status: 'pass',
      message: "Running with appropriate user permissions"
    });
  }

  return results;
}

/**
 * Check Deploy project structure
 */
async function checkProjectStructure(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const projectRoot = process.cwd();

  // Check if we're in a Deploy project
  const packageJsonPath = join(projectRoot, "package.json");
  try {
    const packageJson = await Bun.file(packageJsonPath).text();
    const pkg = JSON.parse(packageJson);
    
    if (pkg.name === "@dialup/deploy" || pkg.dependencies?.["@dialup/deploy"]) {
      results.push({
        name: "Deploy Project",
        status: 'pass',
        message: "Valid Deploy project detected"
      });
    } else {
      results.push({
        name: "Deploy Project",
        status: 'warning',
        message: "Not a Deploy project or Deploy not installed"
      });
    }
  } catch (error) {
    results.push({
      name: "Deploy Project",
      status: 'fail',
      message: "Cannot read package.json"
    });
  }

  // Check for .env file
  const envPath = join(projectRoot, ".env");
  const envExists = await Bun.file(envPath).exists();
  if (envExists) {
    results.push({
      name: "Environment Config",
      status: 'pass',
      message: ".env file exists"
    });
  } else {
    results.push({
      name: "Environment Config",
      status: 'warning',
      message: ".env file not found (will be created during setup)"
    });
  }

  return results;
}

/**
 * Run all diagnostic checks
 */
async function runDiagnostics(verbose: boolean = false): Promise<void> {
  log.step("Running Deploy diagnostics...");

  const checks = [
    checkBun,
    checkDocker,
    checkDockerBuildx,
    checkRailpacks,
    checkMise,
    checkCaddy
  ];

  const results: DiagnosticResult[] = [];

  // Run system checks
  const systemResults = await checkSystemRequirements();
  results.push(...systemResults);

  // Run project checks
  const projectResults = await checkProjectStructure();
  results.push(...projectResults);

  // Run tool checks
  for (const check of checks) {
    try {
      const result = await check();
      results.push(result);
    } catch (error) {
      results.push({
        name: "Unknown Check",
        status: 'fail',
        message: `Check failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  // Display results
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOY SYSTEM DIAGNOSTIC REPORT");
  console.log("=".repeat(60));

  let passCount = 0;
  let warningCount = 0;
  let failCount = 0;

  for (const result of results) {
    const statusIcon = result.status === 'pass' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
    const statusColor = result.status === 'pass' ? colors.green : result.status === 'warning' ? colors.yellow : colors.red;
    
    console.log(`\n${statusIcon} ${colors.cyan}${result.name}${colors.reset}`);
    console.log(`   ${statusColor}${result.message}${colors.reset}`);
    
    if (result.fixCommand && (result.status === 'fail' || (verbose && result.status === 'warning'))) {
      console.log(`   ${colors.blue}Fix: ${result.fixCommand}${colors.reset}`);
    }

    // Count results
    if (result.status === 'pass') passCount++;
    else if (result.status === 'warning') warningCount++;
    else if (result.status === 'fail') failCount++;
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`${colors.green}✅ Passed: ${passCount}${colors.reset}`);
  console.log(`${colors.yellow}⚠️  Warnings: ${warningCount}${colors.reset}`);
  console.log(`${colors.red}❌ Failed: ${failCount}${colors.reset}`);

  if (failCount > 0) {
    console.log(`\n${colors.red}Some critical components are missing or broken.${colors.reset}`);
    console.log(`${colors.blue}Run 'deploy setup' to install missing components.${colors.reset}`);
  } else if (warningCount > 0) {
    console.log(`\n${colors.yellow}System is mostly ready but has some warnings.${colors.reset}`);
    console.log(`${colors.blue}Consider running 'deploy setup' to install optional components.${colors.reset}`);
  } else {
    console.log(`\n${colors.green}🎉 Your Deploy installation is healthy!${colors.reset}`);
  }
}

/**
 * Main doctor command
 */
async function doctor(options: { verbose?: boolean } = {}): Promise<void> {
  try {
    await runDiagnostics(options.verbose || false);
  } catch (error) {
    log.error(
      `Diagnostics failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

/**
 * Register the doctor command
 */
export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Diagnose Deploy installation and system health")
    .option("-v, --verbose", "Show verbose output including fix commands for warnings")
    .action(doctor);
}