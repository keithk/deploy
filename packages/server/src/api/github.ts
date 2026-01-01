// ABOUTME: GitHub API endpoints for repo listing and webhook management.
// ABOUTME: Uses personal access token stored in settings to fetch user repos and manage webhooks.

import { randomBytes } from "crypto";
import { settingsModel } from "@keithk/deploy-core";
import { requireAuth } from "../middleware/auth";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  description: string | null;
  private: boolean;
  updated_at: string;
}

/**
 * Handle /api/github/* requests
 */
export async function handleGitHubApi(
  request: Request,
  path: string
): Promise<Response | null> {
  if (!path.startsWith("/api/github")) {
    return null;
  }

  // All GitHub endpoints require authentication
  const authResponse = requireAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const method = request.method;
  const pathParts = path.split("/").filter(Boolean);

  // GET /api/github/repos - list user repos
  if (method === "GET" && pathParts[2] === "repos") {
    return handleListRepos();
  }

  // GET /api/github/status - check if token is configured
  if (method === "GET" && pathParts[2] === "status") {
    return handleStatus();
  }

  // POST /api/github/webhooks - create a webhook on a repo
  if (method === "POST" && pathParts[2] === "webhooks") {
    return handleCreateWebhook(request);
  }

  // DELETE /api/github/webhooks - delete a webhook from a repo
  if (method === "DELETE" && pathParts[2] === "webhooks") {
    return handleDeleteWebhook(request);
  }

  return null;
}

/**
 * GET /api/github/status - check if GitHub token is configured
 */
function handleStatus(): Response {
  const token = settingsModel.get("github_token");
  return Response.json({
    configured: !!token,
  });
}

/**
 * GET /api/github/repos - list user's GitHub repos
 */
async function handleListRepos(): Promise<Response> {
  const token = settingsModel.get("github_token");

  if (!token) {
    return Response.json(
      { error: "GitHub token not configured. Add it in settings." },
      { status: 400 }
    );
  }

  try {
    // Fetch repos from GitHub API
    const repos: GitHubRepo[] = [];
    let page = 1;
    const perPage = 100;

    // Paginate through all repos
    while (true) {
      const response = await fetch(
        `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=updated&direction=desc`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "DialUpDeploy/1.0",
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return Response.json(
          { error: `GitHub API error: ${response.status} - ${error}` },
          { status: response.status }
        );
      }

      const pageRepos: GitHubRepo[] = await response.json();
      repos.push(...pageRepos);

      // Stop if we got less than a full page
      if (pageRepos.length < perPage) {
        break;
      }

      page++;

      // Safety limit
      if (page > 10) {
        break;
      }
    }

    // Return simplified repo data
    return Response.json(
      repos.map((repo) => ({
        name: repo.name,
        full_name: repo.full_name,
        clone_url: repo.clone_url,
        ssh_url: repo.ssh_url,
        description: repo.description,
        private: repo.private,
        updated_at: repo.updated_at,
      }))
    );
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch repos: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

/**
 * Get or create the webhook secret
 */
function getWebhookSecret(): string {
  let secret = settingsModel.get("github_webhook_secret");
  if (!secret) {
    secret = randomBytes(32).toString("hex");
    settingsModel.set("github_webhook_secret", secret);
  }
  return secret;
}

/**
 * Extract owner and repo from a git URL
 */
function parseGitUrl(gitUrl: string): { owner: string; repo: string } | null {
  // Handle various formats:
  // https://github.com/owner/repo
  // https://github.com/owner/repo.git
  // git@github.com:owner/repo.git
  const httpsMatch = gitUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  const sshMatch = gitUrl.match(/github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  return null;
}

/**
 * Get the webhook callback URL
 */
function getWebhookUrl(): string {
  const domain = settingsModel.get("domain") || process.env.PROJECT_DOMAIN || "localhost";
  return `https://admin.${domain}/webhook/github`;
}

/**
 * POST /api/github/webhooks - create a webhook on a GitHub repo
 */
async function handleCreateWebhook(request: Request): Promise<Response> {
  const token = settingsModel.get("github_token");
  if (!token) {
    return Response.json(
      { error: "GitHub token not configured" },
      { status: 400 }
    );
  }

  let body: { git_url: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.git_url) {
    return Response.json({ error: "git_url is required" }, { status: 400 });
  }

  const parsed = parseGitUrl(body.git_url);
  if (!parsed) {
    return Response.json(
      { error: "Could not parse GitHub URL" },
      { status: 400 }
    );
  }

  const { owner, repo } = parsed;
  const webhookUrl = getWebhookUrl();
  const secret = getWebhookSecret();

  try {
    // Check if webhook already exists
    const listResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/hooks`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "DialUpDeploy/1.0",
        },
      }
    );

    if (!listResponse.ok) {
      const error = await listResponse.text();
      return Response.json(
        { error: `Failed to list webhooks: ${listResponse.status} - ${error}` },
        { status: listResponse.status }
      );
    }

    const existingHooks: Array<{ id: number; config: { url: string } }> =
      await listResponse.json();
    const existing = existingHooks.find((h) => h.config.url === webhookUrl);

    if (existing) {
      return Response.json({
        success: true,
        message: "Webhook already exists",
        webhook_id: existing.id,
      });
    }

    // Create the webhook
    const createResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/hooks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "DialUpDeploy/1.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "web",
          config: {
            url: webhookUrl,
            content_type: "json",
            secret: secret,
          },
          events: ["push"],
          active: true,
        }),
      }
    );

    if (!createResponse.ok) {
      const error = await createResponse.text();
      return Response.json(
        { error: `Failed to create webhook: ${createResponse.status} - ${error}` },
        { status: createResponse.status }
      );
    }

    const created: { id: number } = await createResponse.json();
    return Response.json({
      success: true,
      message: "Webhook created",
      webhook_id: created.id,
    });
  } catch (error) {
    return Response.json(
      { error: `Failed to create webhook: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/github/webhooks - delete a webhook from a GitHub repo
 */
async function handleDeleteWebhook(request: Request): Promise<Response> {
  const token = settingsModel.get("github_token");
  if (!token) {
    return Response.json(
      { error: "GitHub token not configured" },
      { status: 400 }
    );
  }

  let body: { git_url: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.git_url) {
    return Response.json({ error: "git_url is required" }, { status: 400 });
  }

  const parsed = parseGitUrl(body.git_url);
  if (!parsed) {
    return Response.json(
      { error: "Could not parse GitHub URL" },
      { status: 400 }
    );
  }

  const { owner, repo } = parsed;
  const webhookUrl = getWebhookUrl();

  try {
    // Find the webhook
    const listResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/hooks`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "DialUpDeploy/1.0",
        },
      }
    );

    if (!listResponse.ok) {
      const error = await listResponse.text();
      return Response.json(
        { error: `Failed to list webhooks: ${listResponse.status} - ${error}` },
        { status: listResponse.status }
      );
    }

    const existingHooks: Array<{ id: number; config: { url: string } }> =
      await listResponse.json();
    const existing = existingHooks.find((h) => h.config.url === webhookUrl);

    if (!existing) {
      return Response.json({
        success: true,
        message: "Webhook not found (already deleted)",
      });
    }

    // Delete the webhook
    const deleteResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/hooks/${existing.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "DialUpDeploy/1.0",
        },
      }
    );

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      const error = await deleteResponse.text();
      return Response.json(
        { error: `Failed to delete webhook: ${deleteResponse.status} - ${error}` },
        { status: deleteResponse.status }
      );
    }

    return Response.json({
      success: true,
      message: "Webhook deleted",
    });
  } catch (error) {
    return Response.json(
      { error: `Failed to delete webhook: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
