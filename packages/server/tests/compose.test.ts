// ABOUTME: Tests for the docker-compose service module: override generation and env file rendering.
// ABOUTME: Pure-function coverage; no shell-out tests here (those live with the integration suite).

import { describe, test, expect } from "bun:test";
import { parse as parseYaml } from "yaml";
import {
  buildOverride,
  renderEnvFile,
  composeProjectName,
  composeProjectDir,
  composeFilesArgs,
} from "../src/services/compose";

const COBALT_COMPOSE = `
services:
  cobalt:
    image: ghcr.io/imputnet/cobalt:11
    ports:
      - "9000:9000/tcp"
    environment:
      - API_URL=https://cobalt.example.com/
  yt-session-generator:
    image: ghcr.io/imputnet/yt-session-generator:webserver
    ports:
      - "8080:8080"
  watchtower:
    image: ghcr.io/containrrr/watchtower
`;

describe("composeProjectName / Dir / FilesArgs", () => {
  test("project name is stable across calls", () => {
    expect(composeProjectName("cobalt")).toBe("deploy-cobalt");
  });

  test("project dir respects SITES_DIR env var", () => {
    expect(composeProjectDir("cobalt")).toMatch(/cobalt$/);
  });

  test("compose files args points at compose.yml + override", () => {
    const args = composeFilesArgs("cobalt");
    expect(args.length).toBe(4);
    expect(args[0]).toBe("-f");
    expect(args[1]).toMatch(/cobalt\/docker-compose\.yml$/);
    expect(args[2]).toBe("-f");
    expect(args[3]).toMatch(/cobalt\/docker-compose\.override\.yml$/);
  });
});

describe("buildOverride", () => {
  const opts = {
    primaryService: "cobalt",
    primaryPort: 9000,
    allocatedPort: 8005,
    persistentStorage: false,
    envFileName: ".env.deploy",
  };

  test("clobbers ports on every service", () => {
    const overrideYaml = buildOverride(COBALT_COMPOSE, "cobalt", opts);
    const parsed = parseYaml(overrideYaml) as { services: Record<string, any> };
    // every service in the user's compose appears in the override
    expect(Object.keys(parsed.services).sort()).toEqual([
      "cobalt",
      "watchtower",
      "yt-session-generator",
    ]);
    // non-primary services have ports: []
    expect(parsed.services.watchtower.ports).toEqual([]);
    expect(parsed.services["yt-session-generator"].ports).toEqual([]);
  });

  test("primary gets exactly one host binding", () => {
    const overrideYaml = buildOverride(COBALT_COMPOSE, "cobalt", opts);
    const parsed = parseYaml(overrideYaml) as { services: Record<string, any> };
    expect(parsed.services.cobalt.ports).toEqual(["127.0.0.1:8005:9000"]);
  });

  test("primary gets env_file pointing at .env.deploy", () => {
    const overrideYaml = buildOverride(COBALT_COMPOSE, "cobalt", opts);
    const parsed = parseYaml(overrideYaml) as { services: Record<string, any> };
    expect(parsed.services.cobalt.env_file).toEqual(["./.env.deploy"]);
  });

  test("primary gets /data mount only when persistentStorage=true", () => {
    const noStorage = parseYaml(buildOverride(COBALT_COMPOSE, "cobalt", opts)) as any;
    expect(noStorage.services.cobalt.volumes).toBeUndefined();

    const withStorage = parseYaml(
      buildOverride(COBALT_COMPOSE, "cobalt", { ...opts, persistentStorage: true })
    ) as any;
    expect(withStorage.services.cobalt.volumes).toEqual([
      expect.stringMatching(/cobalt:\/data$/),
    ]);
  });

  test("rejects unknown primary service", () => {
    expect(() =>
      buildOverride(COBALT_COMPOSE, "cobalt", { ...opts, primaryService: "ghost" })
    ).toThrow(/not present/);
  });

  test("rejects network_mode: host via assertSafeCompose", () => {
    const yaml = `
services:
  app:
    image: redis
    network_mode: host
    ports: ["6379:6379"]
`;
    expect(() =>
      buildOverride(yaml, "redis", { ...opts, primaryService: "app", primaryPort: 6379 })
    ).toThrow(/network_mode: host/);
  });

  test("rejects privileged: true via assertSafeCompose", () => {
    const yaml = `
services:
  app:
    image: redis
    privileged: true
    ports: ["6379:6379"]
`;
    expect(() =>
      buildOverride(yaml, "redis", { ...opts, primaryService: "app", primaryPort: 6379 })
    ).toThrow(/privileged/);
  });
});

describe("renderEnvFile", () => {
  test("plain values are unquoted", () => {
    expect(renderEnvFile({ FOO: "bar", BAZ: "1234" })).toBe("FOO=bar\nBAZ=1234\n");
  });

  test("values with spaces or quotes are escaped", () => {
    const out = renderEnvFile({ MSG: 'hello "world"' });
    expect(out).toContain('MSG="hello \\"world\\""');
  });

  test("invalid keys are dropped", () => {
    const out = renderEnvFile({ "valid_KEY": "ok", "1bad": "x", "has-dash": "y" });
    expect(out).toBe("valid_KEY=ok\n");
  });

  test("backslashes are escaped", () => {
    const out = renderEnvFile({ PATH: "C:\\Users\\test" });
    expect(out).toContain('PATH="C:\\\\Users\\\\test"');
  });

  test("empty input produces empty string", () => {
    expect(renderEnvFile({})).toBe("");
  });
});
