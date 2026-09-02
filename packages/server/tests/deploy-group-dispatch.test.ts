// ABOUTME: Tests shared-image group deployments without global module mocks.
// ABOUTME: Verifies one build feeds every compatible member while runtime variables stay per-site.

import { describe, expect, mock, test } from "bun:test";
import type { DeployGroupWithSites, Site } from "@keithk/deploy-core";
import {
  deployGroup,
  getGroupBuildCompatibilityError,
  getSharedBuildEnv,
} from "../src/services/deploy-group";

function makeSite(overrides: Partial<Site>): Site {
  return {
    id: "site-1",
    name: "at-one",
    git_url: "https://github.com/example/atmobb.git",
    branch: "main",
    type: "auto",
    visibility: "private",
    status: "stopped",
    container_id: null,
    port: null,
    env_vars: "{}",
    persistent_storage: 0,
    autodeploy: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    last_deployed_at: null,
    sleep_enabled: 0,
    sleep_after_minutes: null,
    last_request_at: null,
    compose_yaml: null,
    primary_service: null,
    primary_port: null,
    custom_domains: "[]",
    build_sources: "[]",
    ...overrides,
  };
}

function makeGroup(sites: Site[]): DeployGroupWithSites {
  return {
    id: "group-1",
    name: "ATMOBB",
    created_at: "2026-01-01T00:00:00.000Z",
    sites,
  };
}

describe("deployGroup", () => {
  test("builds once and deploys the resulting image to every other member", async () => {
    const sites = [
      makeSite({
        env_vars: JSON.stringify({ COMMON: "same", FORUM: "one" }),
      }),
      makeSite({
        id: "site-2",
        name: "at-two",
        env_vars: JSON.stringify({ COMMON: "same", FORUM: "two" }),
      }),
      makeSite({
        id: "site-3",
        name: "at-three",
        env_vars: JSON.stringify({ COMMON: "same", FORUM: "three" }),
      }),
    ];
    const deploySource = mock(async () => ({
      success: true,
      imageName: "deploy-group-group-1:latest",
      sitePath: "/sites/at-one",
    }));
    const deployFromImage = mock(async () => ({ success: true }));
    const reportError = mock(() => undefined);

    await deployGroup(makeGroup(sites), {
      deploySource,
      deployFromImage,
      reportError,
    });

    expect(deploySource).toHaveBeenCalledTimes(1);
    expect(deploySource).toHaveBeenCalledWith(
      "site-1",
      { COMMON: "same" },
      "deploy-group-group-1:latest"
    );
    expect(deployFromImage).toHaveBeenCalledTimes(2);
    expect(deployFromImage).toHaveBeenCalledWith(
      "site-2",
      "deploy-group-group-1:latest",
      "/sites/at-one"
    );
    expect(deployFromImage).toHaveBeenCalledWith(
      "site-3",
      "deploy-group-group-1:latest",
      "/sites/at-one"
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  test("does not roll out when the shared build fails", async () => {
    const deployFromImage = mock(async () => ({ success: true }));
    const reportError = mock(() => undefined);

    await deployGroup(
      makeGroup([
        makeSite({}),
        makeSite({ id: "site-2", name: "at-two" }),
      ]),
      {
        deploySource: mock(async () => ({ success: false, error: "build failed" })),
        deployFromImage,
        reportError,
      }
    );

    expect(deployFromImage).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(
      "Group deployment failed for at-one: build failed"
    );
  });
});

describe("group build compatibility", () => {
  test("allows per-site runtime environments and keeps only shared build values", () => {
    const sites = [
      makeSite({ env_vars: '{"SHARED":"yes","FORUM":"one"}' }),
      makeSite({
        id: "site-2",
        name: "at-two",
        env_vars: '{"SHARED":"yes","FORUM":"two"}',
      }),
    ];

    expect(getGroupBuildCompatibilityError(makeGroup(sites))).toBeNull();
    expect(getSharedBuildEnv(sites)).toEqual({ SHARED: "yes" });
  });

  test("rejects members with different build inputs", () => {
    const source = makeSite({});

    expect(
      getGroupBuildCompatibilityError(
        makeGroup([
          source,
          makeSite({ id: "site-2", name: "other-repo", git_url: "https://example.com/other.git" }),
        ])
      )
    ).toContain("same git repository");
    expect(
      getGroupBuildCompatibilityError(
        makeGroup([
          source,
          makeSite({ id: "site-2", name: "other-branch", branch: "staging" }),
        ])
      )
    ).toContain("same git branch");
    expect(
      getGroupBuildCompatibilityError(
        makeGroup([
          source,
          makeSite({
            id: "site-2",
            name: "other-overlay",
            build_sources: '[{"type":"path","source":"/srv/assets","dest":"assets"}]',
          }),
        ])
      )
    ).toContain("same build sources");
    expect(
      getGroupBuildCompatibilityError(
        makeGroup([source, makeSite({ id: "site-2", name: "compose", type: "compose" })])
      )
    ).toContain("compose site");
  });
});
