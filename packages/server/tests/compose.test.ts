// ABOUTME: Tests for the docker-compose service module: deploy-compose rewrite.
// ABOUTME: Pure-function coverage; no shell-out tests here (those live with the integration suite).

import { describe, test, expect } from "bun:test";
import { parse as parseYaml } from "yaml";
import {
  prepareDeployCompose,
  composeProjectName,
  composeProjectDir,
  composeFilesArgs,
} from "../src/services/compose";

const COBALT_COMPOSE = `
services:
  cobalt:
    image: ghcr.io/imputnet/cobalt:11
    container_name: cobalt
    ports:
      - "9000:9000/tcp"
    environment:
      API_URL: "https://api.url.example/"
  yt-session-generator:
    image: ghcr.io/imputnet/yt-session-generator:webserver
    ports:
      - "8080:8080"
  watchtower:
    image: ghcr.io/containrrr/watchtower
`;

const baseOpts = {
  primaryService: "cobalt",
  primaryPort: 9000,
  allocatedPort: 8005,
  persistentStorage: false,
  envVars: {},
  siteName: "cobalt",
};

describe("composeProjectName / Dir / FilesArgs", () => {
  test("project name is stable", () => {
    expect(composeProjectName("cobalt")).toBe("deploy-cobalt");
  });

  test("project dir resolves under SITES_DIR", () => {
    expect(composeProjectDir("cobalt")).toMatch(/cobalt$/);
  });

  test("files args points to a single compose.yml", () => {
    const args = composeFilesArgs("cobalt");
    expect(args.length).toBe(2);
    expect(args[0]).toBe("-f");
    expect(args[1]).toMatch(/cobalt\/docker-compose\.yml$/);
  });
});

describe("prepareDeployCompose", () => {
  test("strips ports from every service", () => {
    const out = prepareDeployCompose(COBALT_COMPOSE, baseOpts);
    const parsed = parseYaml(out) as { services: Record<string, any> };
    // primary gets exactly one binding (ours); others get none
    expect(parsed.services.cobalt.ports).toEqual(["127.0.0.1:8005:9000"]);
    expect(parsed.services["yt-session-generator"].ports).toBeUndefined();
    expect(parsed.services.watchtower.ports).toBeUndefined();
  });

  test("primary gets only our 127.0.0.1 binding (no host:host on user port)", () => {
    const out = prepareDeployCompose(COBALT_COMPOSE, baseOpts);
    expect(out).not.toMatch(/9000:9000/);
    expect(out).toContain("127.0.0.1:8005:9000");
  });

  test("env vars merge into environment with our values winning", () => {
    const out = prepareDeployCompose(COBALT_COMPOSE, {
      ...baseOpts,
      envVars: { API_URL: "https://cobalt.example.com/", DURATION_LIMIT: "10800" },
    });
    const parsed = parseYaml(out) as { services: Record<string, any> };
    expect(parsed.services.cobalt.environment.API_URL).toBe("https://cobalt.example.com/");
    expect(parsed.services.cobalt.environment.DURATION_LIMIT).toBe("10800");
  });

  test("env vars in list form on user's compose are normalized to map", () => {
    const yaml = `
services:
  app:
    image: redis
    ports: ["6379:6379"]
    environment:
      - FOO=bar
      - EXISTING=keep
`;
    const out = prepareDeployCompose(yaml, {
      ...baseOpts,
      primaryService: "app",
      primaryPort: 6379,
      envVars: { FOO: "override-wins" },
    });
    const parsed = parseYaml(out) as { services: Record<string, any> };
    expect(parsed.services.app.environment.FOO).toBe("override-wins");
    expect(parsed.services.app.environment.EXISTING).toBe("keep");
  });

  test("/data mount + DATA_DIR env are added only when persistentStorage=true", () => {
    const noStorage = parseYaml(prepareDeployCompose(COBALT_COMPOSE, baseOpts)) as any;
    expect(noStorage.services.cobalt.volumes).toBeUndefined();
    expect(noStorage.services.cobalt.environment.DATA_DIR).toBeUndefined();

    const withStorage = parseYaml(
      prepareDeployCompose(COBALT_COMPOSE, { ...baseOpts, persistentStorage: true })
    ) as any;
    expect(withStorage.services.cobalt.volumes).toEqual([
      expect.stringMatching(/cobalt:\/data$/),
    ]);
    expect(withStorage.services.cobalt.environment.DATA_DIR).toBe("/data");
  });

  test("persistent storage volume is appended to existing volumes", () => {
    const yaml = `
services:
  app:
    image: redis
    ports: ["6379:6379"]
    volumes:
      - ./local:/app/local
`;
    const out = parseYaml(
      prepareDeployCompose(yaml, {
        ...baseOpts,
        primaryService: "app",
        primaryPort: 6379,
        persistentStorage: true,
        siteName: "myapp",
      })
    ) as any;
    expect(out.services.app.volumes.length).toBe(2);
    expect(out.services.app.volumes[0]).toBe("./local:/app/local");
    expect(out.services.app.volumes[1]).toMatch(/myapp:\/data$/);
  });

  test("preserves unrelated fields on services", () => {
    const out = parseYaml(prepareDeployCompose(COBALT_COMPOSE, baseOpts)) as any;
    expect(out.services.cobalt.image).toBe("ghcr.io/imputnet/cobalt:11");
    expect(out.services.cobalt.container_name).toBe("cobalt");
    expect(out.services.watchtower.image).toBe("ghcr.io/containrrr/watchtower");
  });

  test("rejects unknown primary service", () => {
    expect(() =>
      prepareDeployCompose(COBALT_COMPOSE, { ...baseOpts, primaryService: "ghost" })
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
      prepareDeployCompose(yaml, { ...baseOpts, primaryService: "app", primaryPort: 6379 })
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
      prepareDeployCompose(yaml, { ...baseOpts, primaryService: "app", primaryPort: 6379 })
    ).toThrow(/privileged/);
  });
});
