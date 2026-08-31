// ABOUTME: Applies a site's build sources — private repos and server directories — to its build context.
// ABOUTME: Runs between clone and build so licensed or private material never lives in the site's own repo.

import { $ } from "bun";
import { cp, mkdir, rm, stat } from "fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "path";
import type { BuildSource } from "@keithk/deploy-core";
import { info } from "@keithk/deploy-core";
import { getAuthenticatedUrl } from "./git";

/**
 * Validate one build source, returning a normalized copy.
 * Throws with an operator-facing message when the entry is unusable.
 */
export function validateBuildSource(value: unknown, index = 0): BuildSource {
  const label = `build source ${index + 1}`;
  if (!value || typeof value !== "object") {
    throw new Error(`${label} must be an object`);
  }

  const { type, source, dest, branch } = value as Record<string, unknown>;

  if (type !== "git" && type !== "path") {
    throw new Error(`${label} type must be "git" or "path"`);
  }
  if (typeof source !== "string" || !source.trim()) {
    throw new Error(`${label} needs a source`);
  }
  if (typeof dest !== "string" || !dest.trim()) {
    throw new Error(`${label} needs a dest`);
  }
  if (branch !== undefined && (typeof branch !== "string" || !branch.trim())) {
    throw new Error(`${label} branch must be a non-empty string when set`);
  }

  const trimmedSource = source.trim();
  if (type === "path" && !isAbsolute(trimmedSource)) {
    throw new Error(`${label} path source must be absolute: ${trimmedSource}`);
  }
  if (type === "git" && !trimmedSource.includes("://") && !trimmedSource.startsWith("git@")) {
    throw new Error(`${label} git source must be a git URL: ${trimmedSource}`);
  }

  return {
    type,
    source: trimmedSource,
    dest: assertSafeDest(dest.trim(), label),
    ...(type === "git" && typeof branch === "string" ? { branch: branch.trim() } : {}),
  };
}

/**
 * Validate a whole list, so a bad entry is rejected when it is saved rather
 * than halfway through a deploy.
 */
export function validateBuildSources(value: unknown): BuildSource[] {
  if (!Array.isArray(value)) {
    throw new Error("build sources must be an array");
  }

  const sources = value.map((entry, index) => validateBuildSource(entry, index));

  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source.dest)) {
      throw new Error(`two build sources both write to ${source.dest}`);
    }
    seen.add(source.dest);
  }

  return sources;
}

/**
 * Reject destinations that would escape the checkout or clobber its git data.
 * Returns the normalized relative path.
 */
function assertSafeDest(dest: string, label: string): string {
  if (isAbsolute(dest)) {
    throw new Error(`${label} dest must be relative to the site checkout: ${dest}`);
  }

  const normalized = normalize(dest).replace(/\/+$/, "");
  if (!normalized || normalized === "." || normalized.startsWith("..")) {
    throw new Error(`${label} dest must name a directory inside the site checkout: ${dest}`);
  }
  if (normalized.split("/")[0] === ".git") {
    throw new Error(`${label} dest may not write into .git`);
  }

  return normalized;
}

/**
 * Resolve a validated dest against a site checkout, confirming it stays inside.
 */
export function resolveDest(sitePath: string, dest: string): string {
  const root = resolve(sitePath);
  const target = resolve(root, dest);
  const rel = relative(root, target);

  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`build source dest escapes the site checkout: ${dest}`);
  }

  return target;
}

/**
 * Strip an injected token so clone failures can be logged safely.
 */
function scrubUrl(message: string, authUrl: string, originalUrl: string): string {
  return authUrl === originalUrl ? message : message.split(authUrl).join(originalUrl);
}

/**
 * Copy every build source into the site checkout, replacing whatever a previous
 * deploy left behind. Git sources are cloned shallow and stripped of their .git
 * directory — the build only needs the files, and this keeps the context small.
 */
export async function applyBuildSources(
  sitePath: string,
  sources: BuildSource[],
  log: (message: string) => void = info
): Promise<void> {
  for (const source of sources) {
    const target = resolveDest(sitePath, source.dest);

    await rm(target, { recursive: true, force: true });
    await mkdir(dirname(target), { recursive: true });

    if (source.type === "git") {
      await cloneBuildSource(source, target, log);
    } else {
      await copyBuildSource(source, target, log);
    }
  }
}

async function cloneBuildSource(
  source: BuildSource,
  target: string,
  log: (message: string) => void
): Promise<void> {
  const branch = source.branch || "main";
  const authUrl = getAuthenticatedUrl(source.source);

  log(`Adding ${source.source} (${branch}) to build context at ${source.dest}`);

  try {
    await $`git clone --depth 1 --branch ${branch} --single-branch ${authUrl} ${target}`.quiet();
  } catch (err) {
    const raw = err instanceof $.ShellError ? err.stderr.toString().trim() : String(err);
    throw new Error(
      `Build source clone failed for ${source.source}: ${scrubUrl(raw, authUrl, source.source)}`
    );
  }

  await rm(join(target, ".git"), { recursive: true, force: true });
}

async function copyBuildSource(
  source: BuildSource,
  target: string,
  log: (message: string) => void
): Promise<void> {
  const stats = await stat(source.source).catch(() => null);
  if (!stats) {
    throw new Error(`Build source path not found on this server: ${source.source}`);
  }

  log(`Adding ${source.source} to build context at ${source.dest}`);
  await cp(source.source, target, { recursive: true });
}
