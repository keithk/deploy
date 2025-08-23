import type { SiteConfig } from "@keithk/deploy-core";
import { join } from "path";
import { writeFileSync, existsSync } from "fs";
import { processManager } from "../utils/process-manager";
import { generateDockerfile } from "@keithk/deploy-core";

/**
 * Docker container management for sites
 */
export class DockerSiteHandler {
  private site: SiteConfig;
  private containerId?: string;
  private mode: "serve" | "dev";

  constructor(site: SiteConfig, mode: "serve" | "dev" = "serve") {
    this.site = site;
    this.mode = mode;
  }

  /**
   * Gets the Docker image name for this site
   */
  private getImageName(): string {
    const tag = this.site.docker?.imageTag || this.site.subdomain;
    return `deploy-site-${tag}:latest`;
  }

  /**
   * Gets the container name for this site
   */
  private getContainerName(): string {
    return `deploy-site-${this.site.subdomain}`;
  }

  /**
   * Gets the Dockerfile path for this site
   */
  private getDockerfilePath(): string {
    if (this.site.docker?.dockerfile) {
      return join(this.site.path, this.site.docker.dockerfile);
    }
    
    // Check common Dockerfile locations
    const dockerfilePaths = [
      join(this.site.path, "Dockerfile"),
      join(this.site.path, "dockerfile")
    ];
    
    for (const path of dockerfilePaths) {
      if (existsSync(path)) {
        return path;
      }
    }
    
    // Generate a Dockerfile if none exists
    const generatedPath = join(this.site.path, "Dockerfile");
    this.generateDockerfile(generatedPath);
    return generatedPath;
  }

  /**
   * Generates a Dockerfile for the site
   */
  private generateDockerfile(dockerfilePath: string): void {
    console.log(`Generating Dockerfile for ${this.site.subdomain}...`);
    
    try {
      const dockerfileContent = generateDockerfile(this.site.path);
      writeFileSync(dockerfilePath, dockerfileContent);
      console.log(`Generated Dockerfile at ${dockerfilePath}`);
    } catch (error) {
      console.error(`Failed to generate Dockerfile for ${this.site.subdomain}:`, error);
      throw error;
    }
  }

  /**
   * Checks if Docker is available on the system
   */
  private async checkDockerAvailable(): Promise<boolean> {
    try {
      const result = await Bun.spawn(["docker", "--version"], {
        stdout: "pipe",
        stderr: "pipe"
      });
      
      await result.exited;
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Builds the Docker image for this site
   */
  public async buildImage(): Promise<boolean> {
    if (!(await this.checkDockerAvailable())) {
      throw new Error("Docker is not available on this system");
    }

    const imageName = this.getImageName();
    const dockerfilePath = this.getDockerfilePath();
    
    console.log(`Building Docker image for ${this.site.subdomain}...`);
    
    const buildArgs = this.site.docker?.buildArgs || {};
    const buildArgFlags = Object.entries(buildArgs).flatMap(([key, value]) => [
      "--build-arg",
      `${key}=${value}`
    ]);

    try {
      const buildProcess = Bun.spawn([
        "docker",
        "build",
        "-t", imageName,
        "-f", dockerfilePath,
        ...buildArgFlags,
        this.site.path
      ], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: this.site.path
      });

      await buildProcess.exited;
      
      if (buildProcess.exitCode === 0) {
        console.log(`Successfully built Docker image: ${imageName}`);
        return true;
      } else {
        const stderr = await new Response(buildProcess.stderr).text();
        console.error(`Docker build failed for ${this.site.subdomain}:`, stderr);
        return false;
      }
    } catch (error) {
      console.error(`Error building Docker image for ${this.site.subdomain}:`, error);
      return false;
    }
  }

  /**
   * Checks if the Docker image needs to be rebuilt
   */
  private async needsRebuild(): Promise<boolean> {
    if (this.site.docker?.alwaysRebuild) {
      return true;
    }

    const imageName = this.getImageName();
    
    try {
      const inspectProcess = Bun.spawn([
        "docker",
        "image",
        "inspect",
        imageName
      ], {
        stdout: "pipe",
        stderr: "pipe"
      });

      await inspectProcess.exited;
      
      // If image doesn't exist, we need to build
      if (inspectProcess.exitCode !== 0) {
        return true;
      }

      // In dev mode, always rebuild to catch changes
      if (this.mode === "dev") {
        return true;
      }

      return false;
    } catch {
      return true;
    }
  }

  /**
   * Starts the Docker container for this site
   */
  public async start(): Promise<boolean> {
    if (!(await this.checkDockerAvailable())) {
      throw new Error("Docker is not available on this system");
    }

    // Build image if needed
    if (await this.needsRebuild()) {
      const buildSuccess = await this.buildImage();
      if (!buildSuccess) {
        return false;
      }
    }

    // Stop existing container if running
    await this.stop();

    const containerName = this.getContainerName();
    const imageName = this.getImageName();
    const containerPort = this.site.docker?.containerPort || 3000;
    const hostPort = this.site.proxyPort || 3000;

    console.log(`Starting Docker container for ${this.site.subdomain}...`);

    // Build docker run command
    const runArgs = [
      "docker",
      "run",
      "-d", // detached
      "--name", containerName,
      "-p", `${hostPort}:${containerPort}`,
      "--restart", "unless-stopped"
    ];

    // Add environment variables
    const environment = this.site.docker?.environment || {};
    for (const [key, value] of Object.entries(environment)) {
      runArgs.push("-e", `${key}=${value}`);
    }

    // Add volume mounts
    const volumes = this.site.docker?.volumes || [];
    for (const volume of volumes) {
      const mountFlag = volume.readOnly ? ":ro" : "";
      runArgs.push("-v", `${volume.host}:${volume.container}${mountFlag}`);
    }

    runArgs.push(imageName);

    try {
      const runProcess = Bun.spawn(runArgs, {
        stdout: "pipe",
        stderr: "pipe"
      });

      await runProcess.exited;
      
      if (runProcess.exitCode === 0) {
        const containerId = (await new Response(runProcess.stdout).text()).trim();
        this.containerId = containerId;
        
        // Note: Docker containers are managed separately from the process manager
        // since they run as system processes, not direct child processes

        console.log(`Docker container started for ${this.site.subdomain} (ID: ${containerId})`);
        console.log(`Container accessible at http://localhost:${hostPort}`);
        
        return true;
      } else {
        const stderr = await new Response(runProcess.stderr).text();
        console.error(`Failed to start Docker container for ${this.site.subdomain}:`, stderr);
        return false;
      }
    } catch (error) {
      console.error(`Error starting Docker container for ${this.site.subdomain}:`, error);
      return false;
    }
  }

  /**
   * Stops the Docker container for this site
   */
  public async stop(): Promise<void> {
    const containerName = this.getContainerName();

    try {
      // Check if container exists and is running
      const psProcess = Bun.spawn([
        "docker",
        "ps",
        "-q",
        "-f", `name=${containerName}`
      ], {
        stdout: "pipe",
        stderr: "pipe"
      });

      await psProcess.exited;
      const runningContainerId = (await new Response(psProcess.stdout).text()).trim();

      if (runningContainerId) {
        console.log(`Stopping Docker container for ${this.site.subdomain}...`);
        
        const stopProcess = Bun.spawn([
          "docker",
          "stop",
          containerName
        ], {
          stdout: "pipe",
          stderr: "pipe"
        });

        await stopProcess.exited;
        
        if (stopProcess.exitCode === 0) {
          console.log(`Stopped Docker container: ${containerName}`);
        }
      }

      // Remove container
      const rmProcess = Bun.spawn([
        "docker",
        "rm",
        "-f",
        containerName
      ], {
        stdout: "pipe",
        stderr: "pipe"
      });

      await rmProcess.exited;

    } catch (error) {
      console.error(`Error stopping Docker container for ${this.site.subdomain}:`, error);
    }

    this.containerId = undefined;
  }

  /**
   * Gets the status of the Docker container
   */
  public async getStatus(): Promise<"running" | "stopped" | "error"> {
    const containerName = this.getContainerName();

    try {
      const statusProcess = Bun.spawn([
        "docker",
        "ps",
        "-f", `name=${containerName}`,
        "--format", "{{.Status}}"
      ], {
        stdout: "pipe",
        stderr: "pipe"
      });

      await statusProcess.exited;
      
      if (statusProcess.exitCode === 0) {
        const status = (await new Response(statusProcess.stdout).text()).trim();
        return status ? "running" : "stopped";
      }
      
      return "stopped";
    } catch {
      return "error";
    }
  }
}

/**
 * Creates a Docker site handler for the given site
 */
export function createDockerHandler(
  site: SiteConfig,
  mode: "serve" | "dev",
  siteIndex: number
) {
  return async (request: Request): Promise<Response> => {
    const handler = new DockerSiteHandler(site, mode);
    
    try {
      const status = await handler.getStatus();
      
      if (status !== "running") {
        console.log(`Docker container for ${site.subdomain} is not running, starting...`);
        const started = await handler.start();
        
        if (!started) {
          return new Response(
            `Failed to start Docker container for ${site.subdomain}`,
            { status: 500 }
          );
        }
        
        // Wait a moment for container to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Proxy the request to the container
      const targetUrl = `http://localhost:${site.proxyPort}${new URL(request.url).pathname}${new URL(request.url).search}`;
      
      try {
        const response = await fetch(targetUrl, {
          method: request.method,
          headers: request.headers,
          body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined
        });
        
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (proxyError) {
        console.error(`Proxy error for ${site.subdomain}:`, proxyError);
        return new Response(
          `Service temporarily unavailable: ${site.subdomain}`,
          { status: 503 }
        );
      }
      
    } catch (error) {
      console.error(`Docker handler error for ${site.subdomain}:`, error);
      return new Response(
        `Error handling Docker site: ${error instanceof Error ? error.message : String(error)}`,
        { status: 500 }
      );
    }
  };
}