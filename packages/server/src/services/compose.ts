// ABOUTME: Docker-compose project management for sites of type='compose'.
// ABOUTME: Generates an override file (port mapping, /data mount, env_file) and runs `docker compose` operations.

import { $ } from "bun";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { info, debug, error } from "@keithk/deploy-core";
import type { Site } from "@keithk/deploy-core";
import { assertSafeCompose } from "../api/compose";
import { getSiteDataPath } from "./container";

const SITES_BASE_PATH = process.env.SITES_DIR || "/var/deploy/sites";

const COMPOSE_FILENAME = "docker-compose.yml";
const OVERRIDE_FILENAME = "docker-compose.override.yml";
const ENV_FILENAME = ".env.deploy";

/**
 * The compose project name for a site. Used as `docker compose -p <name>`.
 * Must stay in sync between create, deploy, sleep/wake and delete paths.
 */
export function composeProjectName(siteName: string): string {
  return `deploy-${siteName}`;
}

/**
 * Working directory for the compose project on disk.
 */
export function composeProjectDir(siteName: string): string {
  return join(SITES_BASE_PATH, siteName);
}

/**
 * The `-f` arguments passed to every `docker compose` invocation for a site.
 */
export function composeFilesArgs(siteName: string): string[] {
  const dir = composeProjectDir(siteName);
  return ["-f", join(dir, COMPOSE_FILENAME), "-f", join(dir, OVERRIDE_FILENAME)];
}

interface ComposeServiceMap {
  [name: string]: Record<string, unknown>;
}

interface OverrideOptions {
  primaryService: string;
  primaryPort: number;
  allocatedPort: number;
  persistentStorage: boolean;
  envFileName: string;
}

/**
 * Build a docker-compose override file that:
 *   - clears `ports:` on every service in the user's compose (replace-merge with [])
 *   - re-adds a single 127.0.0.1:<allocatedPort>:<primaryPort> binding on the primary service
 *   - mounts /var/deploy/data/<name>:/data on the primary when persistent_storage=1
 *   - injects a `.env.deploy` file via env_file on the primary service
 *
 * Returns the override YAML as a string.
 */
export function buildOverride(
  composeYaml: string,
  siteName: string,
  options: OverrideOptions
): string {
  const parsed = parseYaml(composeYaml);
  assertSafeCompose(parsed);

  const services = (parsed as { services: ComposeServiceMap }).services;
  const { primaryService, primaryPort, allocatedPort, persistentStorage, envFileName } = options;

  if (!services[primaryService]) {
    throw new Error(
      `Primary service \`${primaryService}\` is not present in the compose file`
    );
  }

  // Override services map. For every service we set ports: [] to suppress any host
  // port bindings the user asked for. The primary service then re-declares its single
  // allowed binding via the merged-but-replace semantics of compose's `ports` key.
  const overrideServices: ComposeServiceMap = {};

  for (const name of Object.keys(services)) {
    overrideServices[name] = { ports: [] as string[] };
  }

  const primaryOverride: Record<string, unknown> = {
    ports: [`127.0.0.1:${allocatedPort}:${primaryPort}`],
    env_file: [`./${envFileName}`],
  };

  if (persistentStorage) {
    primaryOverride.volumes = [`${getSiteDataPath(siteName)}:/data`];
  }

  overrideServices[primaryService] = primaryOverride;

  const override = { services: overrideServices };
  return stringifyYaml(override);
}

/**
 * Render a `KEY=VALUE` env file from a parsed env-vars map.
 * Lines whose values contain whitespace, quotes, or backslashes are double-quoted with escapes.
 */
export function renderEnvFile(envVars: Record<string, string>): string {
  const lines: string[] = [];
  for (const [key, raw] of Object.entries(envVars)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      // skip keys that aren't valid env-var names
      debug(`Skipping invalid env var key: ${key}`);
      continue;
    }
    const value = String(raw ?? "");
    if (/[\s"\\$`]/.test(value)) {
      const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      lines.push(`${key}="${escaped}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
}

interface PrepareOptions {
  allocatedPort: number;
  envVars: Record<string, string>;
  persistentStorage: boolean;
}

/**
 * Write the compose project files to disk in the site's working directory.
 * Creates the directory if missing. Overwrites existing files.
 */
export function writeComposeProject(site: Site, options: PrepareOptions): void {
  if (!site.compose_yaml || !site.primary_service || site.primary_port == null) {
    throw new Error(
      `Site ${site.name} is type='compose' but missing compose_yaml/primary_service/primary_port`
    );
  }

  const dir = composeProjectDir(site.name);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    info(`Created compose project dir: ${dir}`);
  }

  const envVars = { ...options.envVars };
  if (options.persistentStorage && envVars.DATA_DIR === undefined) {
    envVars.DATA_DIR = "/data";
  }
  const envFileBody = renderEnvFile(envVars);

  const overrideYaml = buildOverride(site.compose_yaml, site.name, {
    primaryService: site.primary_service,
    primaryPort: site.primary_port,
    allocatedPort: options.allocatedPort,
    persistentStorage: options.persistentStorage,
    envFileName: ENV_FILENAME,
  });

  writeFileSync(join(dir, COMPOSE_FILENAME), site.compose_yaml);
  writeFileSync(join(dir, OVERRIDE_FILENAME), overrideYaml);
  writeFileSync(join(dir, ENV_FILENAME), envFileBody, { mode: 0o600 });
  debug(`Wrote compose project files for ${site.name}`);
}

/**
 * Remove the on-disk compose project directory.
 */
export function removeComposeProjectDir(siteName: string): void {
  const dir = composeProjectDir(siteName);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    info(`Removed compose project dir: ${dir}`);
  }
}

export async function pullCompose(siteName: string): Promise<void> {
  const project = composeProjectName(siteName);
  const args = composeFilesArgs(siteName);
  info(`Pulling images for compose project ${project}`);
  await $`docker compose -p ${project} ${args} pull`.quiet();
}

export async function upCompose(siteName: string): Promise<void> {
  const project = composeProjectName(siteName);
  const args = composeFilesArgs(siteName);
  info(`Bringing up compose project ${project}`);
  await $`docker compose -p ${project} ${args} up -d --remove-orphans`.quiet();
}

/**
 * Stop containers without removing them. Used by sleep-monitor so wake is fast.
 */
export async function stopCompose(siteName: string): Promise<void> {
  const project = composeProjectName(siteName);
  const args = composeFilesArgs(siteName);
  info(`Stopping compose project ${project}`);
  try {
    await $`docker compose -p ${project} ${args} stop`.quiet();
  } catch (err) {
    debug(`docker compose stop for ${project} failed (may already be stopped): ${err}`);
  }
}

/**
 * Resume previously-stopped containers. Used by wake.
 */
export async function startCompose(siteName: string): Promise<void> {
  const project = composeProjectName(siteName);
  const args = composeFilesArgs(siteName);
  info(`Starting compose project ${project}`);
  await $`docker compose -p ${project} ${args} start`.quiet();
}

/**
 * Tear down compose project (stop + remove containers, optionally volumes).
 */
export async function downCompose(
  siteName: string,
  removeVolumes = false
): Promise<void> {
  const project = composeProjectName(siteName);
  const args = composeFilesArgs(siteName);
  const dir = composeProjectDir(siteName);
  if (!existsSync(join(dir, COMPOSE_FILENAME))) {
    debug(`No compose file on disk for ${project}; skipping down`);
    return;
  }
  info(`Bringing down compose project ${project}${removeVolumes ? " (with volumes)" : ""}`);
  try {
    if (removeVolumes) {
      await $`docker compose -p ${project} ${args} down -v --remove-orphans`.quiet();
    } else {
      await $`docker compose -p ${project} ${args} down --remove-orphans`.quiet();
    }
  } catch (err) {
    error(`docker compose down failed for ${project}: ${err}`);
  }
}

/**
 * Resolve the docker container ID of the primary service in a running compose project.
 * Returns null if compose is not running.
 */
export async function getPrimaryContainerId(
  siteName: string,
  primaryService: string
): Promise<string | null> {
  const project = composeProjectName(siteName);
  const args = composeFilesArgs(siteName);
  try {
    const out = await $`docker compose -p ${project} ${args} ps -q ${primaryService}`.text();
    const id = out.trim();
    return id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * The docker container *name* of the primary service. Convenient for stable references
 * that survive the project rename. Falls back to the project-prefixed default if compose
 * is not running.
 */
export async function getPrimaryContainerName(
  siteName: string,
  primaryService: string
): Promise<string> {
  const id = await getPrimaryContainerId(siteName, primaryService);
  if (!id) {
    return `${composeProjectName(siteName)}-${primaryService}-1`;
  }
  try {
    const name = await $`docker inspect -f '{{.Name}}' ${id}`.text();
    return name.trim().replace(/^\//, "");
  } catch {
    return `${composeProjectName(siteName)}-${primaryService}-1`;
  }
}

export async function getComposeLogs(
  siteName: string,
  lines: number = 100
): Promise<string> {
  const project = composeProjectName(siteName);
  const args = composeFilesArgs(siteName);
  try {
    return await $`docker compose -p ${project} ${args} logs --tail ${lines} 2>&1`.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to get compose logs for ${project}: ${message}`);
    throw new Error(`Failed to get compose logs: ${message}`);
  }
}
