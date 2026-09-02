// ABOUTME: Builds one image for a compatible deploy group and rolls it out to every member.
// ABOUTME: Keeps each site's runtime environment, storage, health check, and blue-green switch separate.

import {
  error,
  parseBuildSources,
  type DeployGroupWithSites,
  type Site,
} from "@keithk/deploy-core";
import {
  deployGroupSourceSite,
  deploySiteFromImage,
  type DeployResult,
} from "./deploy";

interface DeployGroupDependencies {
  deploySource: (
    siteId: string,
    buildEnv: Record<string, string>,
    imageName: string
  ) => Promise<DeployResult>;
  deployFromImage: (
    siteId: string,
    imageName: string,
    sitePath: string
  ) => Promise<DeployResult>;
  reportError: (message: string) => void;
}

const activeGroups = new Set<string>();

/**
 * A shared image is safe only when every member has the same source checkout
 * and overlays. Per-site environment variables are supplied at container start.
 */
export function getGroupBuildCompatibilityError(
  group: DeployGroupWithSites
): string | null {
  const source = group.sites[0];
  if (!source) return "Deploy group has no sites";

  if (source.type === "compose") {
    return `Site ${source.name} is a compose site and cannot share a Railpack image`;
  }
  if (!source.git_url) {
    return `Site ${source.name} has no git repository`;
  }

  const sourceBuildSources = JSON.stringify(parseBuildSources(source));
  for (const site of group.sites.slice(1)) {
    if (site.type === "compose") {
      return `Site ${site.name} is a compose site and cannot share a Railpack image`;
    }
    if (site.git_url !== source.git_url) {
      return `Site ${site.name} does not use the same git repository as ${source.name}`;
    }
    if (site.branch !== source.branch) {
      return `Site ${site.name} does not use the same git branch as ${source.name}`;
    }
    if (JSON.stringify(parseBuildSources(site)) !== sourceBuildSources) {
      return `Site ${site.name} does not use the same build sources as ${source.name}`;
    }
  }

  return null;
}

/** Return only exact key/value pairs present on every member. */
export function getSharedBuildEnv(sites: Site[]): Record<string, string> {
  if (sites.length === 0) return {};

  const environments = sites.map((site) => parseEnvVars(site.env_vars));
  return Object.fromEntries(
    Object.entries(environments[0]).filter(([key, value]) =>
      environments.every((environment) => environment[key] === value)
    )
  );
}

/** Build and deploy the first member, then fan its image out to the remaining sites. */
export async function deployGroup(
  group: DeployGroupWithSites,
  dependencies: Partial<DeployGroupDependencies> = {}
): Promise<void> {
  const compatibilityError = getGroupBuildCompatibilityError(group);
  if (compatibilityError) throw new Error(compatibilityError);
  if (activeGroups.has(group.id)) {
    throw new Error(`A deployment is already in progress for group ${group.name}`);
  }

  const deploySource = dependencies.deploySource ?? deployGroupSourceSite;
  const deployFromImage = dependencies.deployFromImage ?? deploySiteFromImage;
  const reportError = dependencies.reportError ?? error;
  const [source, ...targets] = group.sites;

  activeGroups.add(group.id);
  try {
    const sourceResult = await deploySource(
      source.id,
      getSharedBuildEnv(group.sites),
      `deploy-group-${group.id}:latest`
    );
    if (!sourceResult.success || !sourceResult.imageName || !sourceResult.sitePath) {
      reportError(
        `Group deployment failed for ${source.name}: ${sourceResult.error || "Shared build did not produce an image"}`
      );
      return;
    }
    const imageName = sourceResult.imageName;
    const sitePath = sourceResult.sitePath;

    await Promise.all(
      targets.map(async (site) => {
        try {
          const result = await deployFromImage(
            site.id,
            imageName,
            sitePath
          );
          if (!result.success) {
            reportError(`Group deployment failed for ${site.name}: ${result.error}`);
          }
        } catch (err) {
          reportError(`Group deployment error for ${site.name}: ${err}`);
        }
      })
    );
  } finally {
    activeGroups.delete(group.id);
  }
}

function parseEnvVars(envVarsJson: string): Record<string, string> {
  try {
    const parsed = JSON.parse(envVarsJson);
    return typeof parsed === "object" && parsed !== null
      ? parsed as Record<string, string>
      : {};
  } catch {
    return {};
  }
}
