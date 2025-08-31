import { spawn } from "bun";
import { resolve } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { debug, info, error, warn } from "../../core";

/**
 * Gogs service manager for lightweight Git operations
 */
export class GogsService {
  private static instance: GogsService | null = null;
  private containerName = "deploy-gogs";
  private dataDir: string;
  private port = 3010;

  constructor() {
    this.dataDir = resolve(process.cwd(), "data/gogs");
  }

  static getInstance(): GogsService {
    if (!GogsService.instance) {
      GogsService.instance = new GogsService();
    }
    return GogsService.instance;
  }

  /**
   * Check if Gogs container is running
   */
  async isRunning(): Promise<boolean> {
    try {
      const proc = spawn([
        "docker", "ps", "--filter", `name=${this.containerName}`, "--format", "{{.ID}}"
      ], {
        stdio: ["pipe", "pipe", "pipe"]
      });

      await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      return stdout.trim().length > 0;
    } catch (err) {
      debug("Error checking Gogs status:", err);
      return false;
    }
  }

  /**
   * Start the Gogs service
   */
  async start(): Promise<boolean> {
    try {
      // Check if already running
      if (await this.isRunning()) {
        info("Gogs service is already running");
        return true;
      }

      // Ensure data directory exists
      this.ensureDataDirectory();

      info("Starting Gogs service...");

      // Create the docker run command
      const proc = spawn([
        "docker", "run", "-d",
        "--name", this.containerName,
        "--restart", "unless-stopped",
        "-p", `${this.port}:3000`,
        "-p", "2222:22",
        "-v", `${this.dataDir}:/data`,
        "-e", "USER_UID=1000",
        "-e", "USER_GID=1000",
        "gogs/gogs:0.13"
      ], {
        stdio: ["pipe", "pipe", "pipe"]
      });

      await proc.exited;

      if (proc.exitCode === 0) {
        info(`Gogs service started on port ${this.port}`);
        
        // Give it a moment to start up
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verify it's actually running
        return await this.isRunning();
      } else {
        const stderr = await new Response(proc.stderr).text();
        error("Failed to start Gogs service:", stderr);
        return false;
      }
    } catch (err) {
      error("Error starting Gogs service:", err);
      return false;
    }
  }

  /**
   * Stop the Gogs service
   */
  async stop(): Promise<boolean> {
    try {
      if (!(await this.isRunning())) {
        info("Gogs service is not running");
        return true;
      }

      info("Stopping Gogs service...");

      const proc = spawn([
        "docker", "stop", this.containerName
      ], {
        stdio: ["pipe", "pipe", "pipe"]
      });

      await proc.exited;

      if (proc.exitCode === 0) {
        info("Gogs service stopped");
        
        // Remove the container
        const removeProc = spawn([
          "docker", "rm", this.containerName
        ], {
          stdio: ["pipe", "pipe", "pipe"]
        });
        
        await removeProc.exited;
        return true;
      } else {
        const stderr = await new Response(proc.stderr).text();
        error("Failed to stop Gogs service:", stderr);
        return false;
      }
    } catch (err) {
      error("Error stopping Gogs service:", err);
      return false;
    }
  }

  /**
   * Restart the Gogs service
   */
  async restart(): Promise<boolean> {
    info("Restarting Gogs service...");
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000));
    return await this.start();
  }

  /**
   * Get the Gogs URL for internal use
   */
  getUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /**
   * Get the Gogs URL for external access
   */
  getExternalUrl(): string {
    const domain = process.env.PROJECT_DOMAIN || 'localhost';
    return `https://git.${domain}`;
  }

  /**
   * Ensure data directory and basic configuration exists
   */
  private ensureDataDirectory(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
      info(`Created Gogs data directory: ${this.dataDir}`);
    }

    // Create basic app.ini configuration if it doesn't exist
    const confDir = resolve(this.dataDir, "gogs/conf");
    const appIniPath = resolve(confDir, "app.ini");
    
    if (!existsSync(appIniPath)) {
      mkdirSync(confDir, { recursive: true });
      
      const basicConfig = `[server]
HTTP_PORT = 3000
DOMAIN = git.${process.env.PROJECT_DOMAIN || 'localhost'}
ROOT_URL = https://git.${process.env.PROJECT_DOMAIN || 'localhost'}/

[database]
DB_TYPE = sqlite3
PATH = data/gogs.db

[security]
SECRET_KEY = ${Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)}

[service]
REGISTER_EMAIL_CONFIRM = false
ENABLE_NOTIFY_MAIL = false
DISABLE_REGISTRATION = false
ENABLE_CAPTCHA = false
REQUIRE_SIGNIN_VIEW = false

[repository]
DEFAULT_BRANCH = main
`;

      writeFileSync(appIniPath, basicConfig);
      info("Created basic Gogs configuration");
    }
  }
}

// Export singleton instance
export const gogsService = GogsService.getInstance();