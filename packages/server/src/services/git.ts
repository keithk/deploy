// ABOUTME: Git operations for cloning and pulling site repositories.
// ABOUTME: Uses Bun's shell for executing git commands in the sites directory.

import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import { info, debug, error, settingsModel } from "@keithk/deploy-core";

/**
 * Supply GitHub credentials per command, including after an HTTP redirect.
 * Keep tokens out of command arguments and persisted origin URLs.
 */
export function getGitAuth(gitUrl: string) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    DEPLOY_GITHUB_TOKEN: undefined,
  };
  let parsed: URL;
  try {
    parsed = new URL(gitUrl);
  } catch {
    return { url: gitUrl, env }; // SCP-style SSH URLs and local paths.
  }
  if (parsed.protocol !== "https:" || parsed.host !== "github.com") {
    return { url: gitUrl, env };
  }

  // Remove credentials left behind by earlier versions, even on token rotation.
  parsed.username = "";
  parsed.password = "";
  const url = parsed.href;
  const token = settingsModel.get("github_token");
  if (!token) return { url, env };

  // Append to inherited command-scoped config rather than discarding it.
  const count = Number(env.GIT_CONFIG_COUNT || "0");
  const key = "credential.https://github.com.helper";
  env.GIT_CONFIG_COUNT = String(count + 2);
  env[`GIT_CONFIG_KEY_${count}`] = key;
  env[`GIT_CONFIG_VALUE_${count}`] = ""; // Don't store this token in other helpers.
  env[`GIT_CONFIG_KEY_${count + 1}`] = key;
  env[`GIT_CONFIG_VALUE_${count + 1}`] =
    '!f() { if [ "$1" = get ]; then printf "username=x-access-token\\npassword=%s\\n" "$DEPLOY_GITHUB_TOKEN"; fi; }; f';
  env.DEPLOY_GITHUB_TOKEN = token;
  return { url, env };
}

/** Scrub current tokens and legacy credential URLs before logging Git failures. */
export function gitErrorMessage(err: unknown): string {
  let message = err instanceof $.ShellError ? err.stderr.toString().trim() : String(err);
  const token = settingsModel.get("github_token");
  if (token) message = message.split(token).join("[REDACTED]");
  return message.replace(/(https?:\/\/)[^/\s@]+@/g, "$1[REDACTED]@");
}

/**
 * Get the sites directory from environment or default
 */
function getSitesDir(): string {
  return process.env.ROOT_DIR || "/var/deploy/sites";
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

  const { url, env } = getGitAuth(gitUrl);
  info(`Cloning ${url} (branch: ${branch}) to ${sitePath}`);

  try {
    await $`git clone --branch ${branch} --single-branch ${url} ${sitePath}`.env(env).quiet();
    debug(`Successfully cloned ${url} to ${sitePath}`);
    return sitePath;
  } catch (err) {
    const message = gitErrorMessage(err);
    error(`Failed to clone ${url}: ${message}`);
    throw new Error(`Git clone failed: ${message}`);
  }
}

/**
 * Pull the latest changes for an existing site
 * @param name The site name
 * @param branch The branch to pull (defaults to "main")
 * @param gitUrl Canonical repo URL. Falls back to the existing origin when
 *   omitted. Legacy token-bearing GitHub origins are cleaned before fetching.
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
    const origin = gitUrl ?? (await $`git -C ${sitePath} config --get remote.origin.url`.text()).trim();
    const { url, env } = getGitAuth(origin);
    await $`git -C ${sitePath} remote set-url origin ${url}`.quiet();
    // Fetch and reset to handle force pushes
    await $`git -C ${sitePath} fetch origin ${branch}`.env(env).quiet();
    await $`git -C ${sitePath} reset --hard origin/${branch}`.quiet();
    debug(`Successfully pulled latest changes for ${name}`);
  } catch (err) {
    const message = gitErrorMessage(err);
    error(`Failed to pull ${name}: ${message}`);
    throw new Error(`Git pull failed: ${message}`);
  }
}
