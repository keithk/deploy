// ABOUTME: GitHub API endpoints for repo listing.
// ABOUTME: Uses personal access token stored in settings to fetch user repos.

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
