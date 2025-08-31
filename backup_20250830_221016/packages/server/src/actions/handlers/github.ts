import { join } from "path";
import type {
  Action,
  ActionContext,
  ActionResult,
  ActionRoute,
  SiteConfig
} from "@keithk/deploy-core";
import { buildSite } from "../discovery";
import { createHmac } from "crypto";
import { processManager } from "../../utils/process-manager";
import { debug, info, warn } from "@keithk/deploy-core";

/**
 * Verify the GitHub webhook signature
 * @param payload The webhook payload
 * @param signature The signature from the X-Hub-Signature-256 header
 * @param secret The webhook secret
 * @returns Whether the signature is valid
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  // Remove 'sha256=' prefix
  const sig = signature.startsWith("sha256=")
    ? signature.substring(7)
    : signature;

  // Create HMAC
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  const digest = hmac.digest("hex");

  return sig === digest;
}

/**
 * Execute git pull in the specified directory
 * Always assumes we're on main branch and just performs git pull
 * @param repoPath Path to the repository
 * @returns Result of the git pull operation
 */
export async function gitPull(
  repoPath: string
): Promise<{ success: boolean; message: string; output?: string }> {
  try {
    info(`Executing git pull in ${repoPath} (assuming main branch)`);

    // Simply pull the latest changes (assuming we're on main) using Bun.spawn
    const proc = Bun.spawn(["git", "pull"], {
      cwd: repoPath,
      stderr: "pipe",
      stdout: "pipe"
    });

    // Wait for the process to complete and get output
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return {
        success: false,
        message: "Failed to pull latest changes",
        output: stderr || ""
      };
    }

    return {
      success: true,
      message: `Successfully pulled latest changes from main branch`,
      output: stdout || ""
    };
  } catch (error) {
    return {
      success: false,
      message: `Error executing git pull: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
}

/**
 * Extract changed files from GitHub webhook payload
 * @param payload The webhook payload
 * @returns Array of changed file paths
 */
export function getChangedFiles(payload: any): string[] {
  const changedFiles: string[] = [];

  // Handle push event
  if (payload.commits) {
    for (const commit of payload.commits) {
      if (commit.added) changedFiles.push(...commit.added);
      if (commit.modified) changedFiles.push(...commit.modified);
      if (commit.removed) changedFiles.push(...commit.removed);
    }
  }

  return [...new Set(changedFiles)]; // Remove duplicates
}

/**
 * Determine which sites are affected by the changed files
 * @param changedFiles Array of changed file paths
 * @param sites Array of site configurations
 * @returns Array of affected site configurations
 */
export function determineAffectedSites(
  changedFiles: string[],
  sites: SiteConfig[]
): SiteConfig[] {
  const affectedSites: SiteConfig[] = [];

  // Check each site to see if any of its files were changed
  for (const site of sites) {
    // Get the site directory name (last part of the path)
    const siteDirName = site.path.split("/").pop() || "";

    // Check if any changed file is in this site's directory
    const siteAffected = changedFiles.some((file) =>
      file.startsWith(`sites/${siteDirName}/`)
    );

    if (siteAffected) {
      affectedSites.push(site);
    }
  }

  return affectedSites;
}

/**
 * Process a GitHub webhook
 * @param request The webhook request
 * @param context The action context
 * @returns Response to the webhook
 */
async function processGitHubWebhook(
  request: Request,
  context: ActionContext,
  config: { repository: string; branch: string; secret?: string }
): Promise<Response> {
  try {
    // Get the request body
    const rawBody = await request.text();
    let body: any;

    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Invalid JSON payload"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Get the signature from headers
    const signature = request.headers.get("X-Hub-Signature-256");

    // Verify signature if secret is provided
    if (config.secret) {
      const isValid = verifyGitHubSignature(rawBody, signature, config.secret);

      if (!isValid) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Invalid webhook signature"
          }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }
    }

    // Git pull the entire repository (always from main)
    const repoPath = join(context.rootDir, "..");
    const pullResult = await gitPull(repoPath);

    if (!pullResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Failed to pull repository: ${pullResult.message}`,
          data: { output: pullResult.output }
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Determine which sites were affected by the changes
    const changedFiles = getChangedFiles(body);
    const affectedSites = determineAffectedSites(changedFiles, context.sites);

    if (affectedSites.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No sites affected by the changes",
          data: { changedFiles }
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Rebuild affected sites
    const buildResults: Record<string, { success: boolean; message: string }> =
      {};
    const restartResults: Record<
      string,
      { success: boolean; message: string }
    > = {};
    let allSucceeded = true;

    for (const site of affectedSites) {
      // Rebuild the site
      const result = await buildSite(site, context);
      buildResults[site.subdomain || ""] = result;

      if (!result.success) {
        allSucceeded = false;
      }

      // Restart the site's process if it's running
      // For static-build and passthrough sites that have processes
      if (site.type === "static-build" || site.type === "passthrough") {
        try {
          // Generate the process ID based on site and port
          const port =
            site.type === "static-build"
              ? site.devPort
              : site.type === "passthrough"
              ? site.proxyPort
              : null;

          if (port) {
            const processId = `${site.subdomain}:${port}`;

            // Check if the process exists before attempting to restart
            if (processManager.hasProcess(site.subdomain || "", port)) {
              info(`Restarting process for site: ${site.subdomain}`);
              const restartResult = await processManager.restartProcess(
                processId
              );

              restartResults[site.subdomain || ""] = {
                success: restartResult,
                message: restartResult
                  ? `Successfully restarted process for ${site.subdomain}`
                  : `Failed to restart process for ${site.subdomain}`
              };
            } else {
              restartResults[site.subdomain || ""] = {
                success: true,
                message: `No running process found for ${site.subdomain}`
              };
            }
          } else {
            restartResults[site.subdomain || ""] = {
              success: true,
              message: `Site ${site.subdomain} does not have a port configured`
            };
          }
        } catch (error) {
          warn(
            `Error restarting process for ${site.subdomain}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          restartResults[site.subdomain || ""] = {
            success: false,
            message: `Error restarting process: ${
              error instanceof Error ? error.message : String(error)
            }`
          };
        }
      } else {
        // For static and dynamic sites that don't have long-running processes
        restartResults[site.subdomain || ""] = {
          success: true,
          message: `No process restart needed for ${site.type} site`
        };
      }
    }

    return new Response(
      JSON.stringify({
        success: allSucceeded,
        message: `Updated repository and rebuilt ${affectedSites.length} sites`,
        data: {
          changedFiles,
          affectedSites: affectedSites.map((s) => s.subdomain),
          buildResults,
          restartResults
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    warn(`Error processing GitHub webhook: ${errorMessage}`);

    return new Response(
      JSON.stringify({
        success: false,
        message: `Error processing webhook: ${errorMessage}`
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}

/**
 * Create a GitHub action that exposes a webhook route
 * @param config GitHub configuration
 * @returns The GitHub action
 */
export function createGitHubAction(config: {
  repository: string;
  branch: string;
  secret?: string;
}): Action {
  // Define the webhook route
  const webhookRoute: ActionRoute = {
    path: "/webhook/github",
    method: "POST",
    handler: async (req, context) => {
      return processGitHubWebhook(req, context, config);
    }
  };

  return {
    id: "github",
    type: "system",
    config,
    // Expose the webhook route
    routes: [webhookRoute],
    // Add server lifecycle hooks
    hooks: ["server:after-start"],
    // Handler for direct execution (e.g., for testing)
    async handler(payload, context: ActionContext): Promise<ActionResult> {
      info("GitHub action executed directly");

      // If this is a webhook payload, process it
      if (payload.rawBody && payload.headers) {
        try {
          const mockRequest = new Request("http://localhost/webhook/github", {
            method: "POST",
            headers: new Headers(payload.headers),
            body: payload.rawBody
          });

          const response = await processGitHubWebhook(
            mockRequest,
            context,
            config
          );
          const responseBody = await response.json();

          return {
            success: responseBody.success,
            message: responseBody.message,
            data: responseBody.data
          };
        } catch (error) {
          return {
            success: false,
            message: `Error processing webhook payload: ${
              error instanceof Error ? error.message : String(error)
            }`
          };
        }
      }

      // Otherwise, just return a success message
      return {
        success: true,
        message: "GitHub action is ready to receive webhooks",
        data: {
          webhookUrl: "/webhook/github",
          repository: config.repository,
          branch: config.branch
        }
      };
    }
  };
}
