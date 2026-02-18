// ABOUTME: Webhook handler for GitHub autodeploy.
// ABOUTME: Receives push events, matches to sites by repo URL, and triggers rebuild.

import { createHmac } from "crypto";
import { settingsModel, siteModel, info, warn } from "@keithk/deploy-core";
import { pullSite, deploySite } from "../services";

interface GitHubPushPayload {
  ref?: string;
  repository?: {
    clone_url?: string;
    html_url?: string;
    url?: string;
  };
}

/**
 * Verify the GitHub webhook signature
 */
function verifySignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  const sig = signature.startsWith("sha256=")
    ? signature.substring(7)
    : signature;

  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  const digest = hmac.digest("hex");

  // Use timing-safe comparison
  if (sig.length !== digest.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < sig.length; i++) {
    result |= sig.charCodeAt(i) ^ digest.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Normalize a git URL for comparison
 */
function normalizeGitUrl(url: string): string {
  let normalized = url.toLowerCase().trim();
  normalized = normalized.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/^git@/, "");
  normalized = normalized.replace(":", "/");
  normalized = normalized.replace(/\.git$/, "");
  normalized = normalized.replace(/\/$/, "");
  return normalized;
}

/**
 * Handle POST /webhook/github for autodeploy
 */
export async function handleAutodeployWebhook(
  request: Request
): Promise<Response | null> {
  const url = new URL(request.url);

  // Only handle POST /webhook/github
  if (request.method !== "POST" || url.pathname !== "/webhook/github") {
    return null;
  }

  // Get webhook secret
  const secret = settingsModel.get("github_webhook_secret");
  if (!secret) {
    warn("Autodeploy webhook received but no webhook secret configured");
    return Response.json(
      { success: false, message: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  // Read and parse body
  let rawBody: string;
  let payload: GitHubPushPayload;

  try {
    rawBody = await request.text();
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json(
      { success: false, message: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  // Verify signature
  const signature = request.headers.get("X-Hub-Signature-256");
  if (!verifySignature(rawBody, signature, secret)) {
    warn("Autodeploy webhook received with invalid signature");
    return Response.json(
      { success: false, message: "Invalid signature" },
      { status: 401 }
    );
  }

  // Extract repository URL from payload
  const repoUrl =
    payload.repository?.clone_url ||
    payload.repository?.html_url ||
    payload.repository?.url;

  if (!repoUrl) {
    return Response.json(
      { success: false, message: "No repository URL in payload" },
      { status: 400 }
    );
  }

  // Find matching site
  const site = siteModel.findByGitUrl(repoUrl);

  if (!site) {
    info(`Autodeploy webhook: no site found for ${repoUrl}`);
    return Response.json(
      { success: false, message: "No site configured for this repository" },
      { status: 404 }
    );
  }

  // Check autodeploy is enabled
  if (!site.autodeploy) {
    info(`Autodeploy webhook: autodeploy disabled for ${site.name}`);
    return Response.json(
      { success: false, message: "Autodeploy is disabled for this site" },
      { status: 403 }
    );
  }

  // Check this is a push to the configured branch
  const pushBranch = payload.ref?.replace("refs/heads/", "");
  if (pushBranch && pushBranch !== site.branch) {
    info(
      `Autodeploy webhook: push to ${pushBranch}, site configured for ${site.branch}`
    );
    return Response.json({
      success: true,
      message: `Push to ${pushBranch} ignored (site tracks ${site.branch})`,
    });
  }

  info(`Autodeploy triggered for ${site.name} from ${repoUrl}`);

  try {
    // Pull the latest code
    await pullSite(site.name, site.branch);

    // Redeploy the site
    const result = await deploySite(site.id);

    if (result.success) {
      info(`Autodeploy successful for ${site.name}`);
      return Response.json({
        success: true,
        message: `Site ${site.name} redeployed successfully`,
        data: {
          site: site.name,
          branch: site.branch,
        },
      });
    } else {
      warn(`Autodeploy failed for ${site.name}: ${result.error}`);
      return Response.json(
        {
          success: false,
          message: `Deploy failed: ${result.error}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warn(`Autodeploy error for ${site.name}: ${message}`);
    return Response.json(
      {
        success: false,
        message: `Autodeploy failed: ${message}`,
      },
      { status: 500 }
    );
  }
}
