// ABOUTME: Git operations for cloning and pulling site repositories.
// ABOUTME: Uses Bun's shell for executing git commands in the sites directory.

import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import { info, debug, error, settingsModel } from "@keithk/deploy-core";

/**
 * Inject GitHub token into URL for private repo access
 */
function getAuthenticatedUrl(gitUrl: string): string {
  const token = settingsModel.get("github_token");
  if (!token) return gitUrl;

  // Only inject for GitHub HTTPS URLs
  if (gitUrl.startsWith("https://github.com/")) {
    return gitUrl.replace("https://github.com/", `https://${token}@github.com/`);
  }

  return gitUrl;
}

/**
 * Get the sites directory from environment or default
 */
function getSitesDir(): string {
  return process.env.SITES_DIR || "/var/deploy/sites";
}

/**
 * Get the filesystem path for a site
 */
export function getSitePath(name: string): string {
  return join(getSitesDir(), name);
}

/**
 * Clone a git repository (or pull if it already exists)
 * @param gitUrl The URL of the git repository
 * @param name The site name (used as the directory name)
 * @param branch The branch to clone (defaults to "main")
 * @returns The path to the cloned site
 */
export async function cloneSite(
  gitUrl: string,
  name: string,
  branch: string = "main"
): Promise<string> {
  const sitePath = getSitePath(name);

  if (existsSync(sitePath)) {
    info(`Site ${name} already exists, pulling latest changes`);
    await pullSite(name, branch, gitUrl);
    return sitePath;
  }

  info(`Cloning ${gitUrl} (branch: ${branch}) to ${sitePath}`);

  try {
    const authUrl = getAuthenticatedUrl(gitUrl);
    await $`git clone --branch ${branch} --single-branch ${authUrl} ${sitePath}`.quiet();
    debug(`Successfully cloned ${gitUrl} to ${sitePath}`);
    return sitePath;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to clone ${gitUrl}: ${message}`);
    throw new Error(`Git clone failed: ${message}`);
  }
}

/**
 * Pull the latest changes for an existing site
 * @param name The site name
 * @param branch The branch to pull (defaults to "main")
 * @param gitUrl Canonical repo URL. When provided, the origin remote is
 *   rewritten with the current token from settings before fetching — this
 *   lets rotated tokens take effect on sites cloned with an older token.
 */
export async function pullSite(
  name: string,
  branch: string = "main",
  gitUrl?: string
): Promise<void> {
  const sitePath = getSitePath(name);

  if (!existsSync(sitePath)) {
    throw new Error(`Site ${name} does not exist at ${sitePath}`);
  }

  info(`Pulling latest changes for ${name} (branch: ${branch})`);

  try {
    if (gitUrl) {
      const authUrl = getAuthenticatedUrl(gitUrl);
      await $`git -C ${sitePath} remote set-url origin ${authUrl}`.quiet();
    }
    // Fetch and reset to handle force pushes
    await $`git -C ${sitePath} fetch origin ${branch}`.quiet();
    await $`git -C ${sitePath} reset --hard origin/${branch}`.quiet();
    debug(`Successfully pulled latest changes for ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to pull ${name}: ${message}`);
    throw new Error(`Git pull failed: ${message}`);
  }
}
