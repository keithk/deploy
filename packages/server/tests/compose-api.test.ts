// ABOUTME: Tests for the compose-parse API endpoint and the underlying compose YAML parser.
// ABOUTME: Covers validation, port extraction, security rejections, and the request handler.

import { describe, test, expect } from "bun:test";
import {
  parseComposeFile,
  extractContainerPort,
  assertSafeCompose,
  ComposeError,
  handleComposeApi,
} from "../src/api/compose";
import { parseEnvText } from "../src/api/sites";

const COBALT_COMPOSE = `
services:
  cobalt:
    image: ghcr.io/imputnet/cobalt:11
    ports:
      - "9000:9000/tcp"
    environment:
      - API_URL=https://cobalt.example.com/
  watchtower:
    image: ghcr.io/containrrr/watchtower
`;

describe("extractContainerPort", () => {
  test("string forms", () => {
    expect(extractContainerPort("9000")).toBe(9000);
    expect(extractContainerPort("9000:9000")).toBe(9000);
    expect(extractContainerPort("9000:9000/tcp")).toBe(9000);
    expect(extractContainerPort("127.0.0.1:9000:9000")).toBe(9000);
    expect(extractContainerPort("nope")).toBeNull();
  });

  test("number form", () => {
    expect(extractContainerPort(9000)).toBe(9000);
  });

  test("object form (long syntax)", () => {
    expect(extractContainerPort({ target: 9000, published: 9000 })).toBe(9000);
    expect(extractContainerPort({ target: "9000" })).toBe(9000);
  });
});

describe("parseComposeFile", () => {
  test("returns services with their published ports", () => {
    const result = parseComposeFile(COBALT_COMPOSE);
    const cobalt = result.services.find((s) => s.name === "cobalt");
    const watchtower = result.services.find((s) => s.name === "watchtower");
    expect(cobalt?.ports).toEqual([9000]);
    expect(watchtower?.ports).toEqual([]);
    expect(result.candidates).toEqual(["cobalt"]);
  });

  test("rejects YAML without a services map", () => {
    expect(() => parseComposeFile("foo: bar\n")).toThrow(ComposeError);
  });

  test("rejects compose with no service publishing a port", () => {
    expect(() =>
      parseComposeFile("services:\n  app:\n    image: redis\n")
    ).toThrow(/at least one service must publish a port/i);
  });

  test("rejects malformed YAML", () => {
    expect(() => parseComposeFile(":\n:")).toThrow();
  });

  test("uses expose: when ports: is missing", () => {
    const yaml = `
services:
  api:
    image: example/api
    expose:
      - "8080"
`;
    const result = parseComposeFile(yaml);
    expect(result.services[0].ports).toEqual([8080]);
    expect(result.candidates).toEqual(["api"]);
  });
});

describe("assertSafeCompose", () => {
  test("rejects network_mode: host", () => {
    expect(() =>
      assertSafeCompose({
        services: { app: { network_mode: "host", ports: ["80:80"] } },
      })
    ).toThrow(/network_mode: host/);
  });

  test("rejects privileged: true", () => {
    expect(() =>
      assertSafeCompose({
        services: { app: { privileged: true, ports: ["80:80"] } },
      })
    ).toThrow(/privileged/);
  });

  test("accepts a normal service", () => {
    expect(() =>
      assertSafeCompose({ services: { app: { image: "redis" } } })
    ).not.toThrow();
  });
});

describe("handleComposeApi", () => {
  test("returns 405 for non-POST", async () => {
    const res = await handleComposeApi(
      new Request("https://example.com/api/compose/parse", { method: "GET" }),
      "/api/compose/parse"
    );
    expect(res?.status).toBe(405);
  });

  test("returns null for unrelated paths", async () => {
    const res = await handleComposeApi(
      new Request("https://example.com/api/compose/other", { method: "POST" }),
      "/api/compose/other"
    );
    expect(res).toBeNull();
  });

  test("400 on invalid JSON body", async () => {
    const res = await handleComposeApi(
      new Request("https://example.com/api/compose/parse", {
        method: "POST",
        body: "{not json",
        headers: { "content-type": "application/json" },
      }),
      "/api/compose/parse"
    );
    expect(res?.status).toBe(400);
  });

  test("400 when neither yaml nor url provided", async () => {
    const res = await handleComposeApi(
      new Request("https://example.com/api/compose/parse", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      "/api/compose/parse"
    );
    expect(res?.status).toBe(400);
    const body = await res!.json();
    expect(body.code).toBe("invalid_yaml");
  });

  test("200 with services + candidates on valid yaml", async () => {
    const res = await handleComposeApi(
      new Request("https://example.com/api/compose/parse", {
        method: "POST",
        body: JSON.stringify({ yaml: COBALT_COMPOSE }),
        headers: { "content-type": "application/json" },
      }),
      "/api/compose/parse"
    );
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.candidates).toEqual(["cobalt"]);
    expect(body.services.find((s: any) => s.name === "cobalt").ports).toEqual([9000]);
  });

  test("parseEnvText basic KEY=VALUE", () => {
    const result = parseEnvText("FOO=bar\nBAZ=qux\n");
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  test("parseEnvText skips blank lines and comments", () => {
    const result = parseEnvText("\n# a comment\nFOO=1\n\n  # indented comment\nBAR=2");
    expect(result).toEqual({ FOO: "1", BAR: "2" });
  });

  test("parseEnvText preserves equals signs in values", () => {
    const result = parseEnvText("URL=https://x.com/?a=1&b=2");
    expect(result.URL).toBe("https://x.com/?a=1&b=2");
  });

  test("parseEnvText strips matching surrounding quotes", () => {
    const result = parseEnvText(`FOO="bar baz"\nBAZ='qux'`);
    expect(result).toEqual({ FOO: "bar baz", BAZ: "qux" });
  });

  test("parseEnvText drops invalid keys", () => {
    const result = parseEnvText("VALID_KEY=ok\n1bad=x\nhas-dash=y\n");
    expect(result).toEqual({ VALID_KEY: "ok" });
  });

  test("400 with code on forbidden directive", async () => {
    const yaml = `
services:
  app:
    image: redis
    network_mode: host
    ports: ["6379:6379"]
`;
    const res = await handleComposeApi(
      new Request("https://example.com/api/compose/parse", {
        method: "POST",
        body: JSON.stringify({ yaml }),
        headers: { "content-type": "application/json" },
      }),
      "/api/compose/parse"
    );
    expect(res?.status).toBe(400);
    const body = await res!.json();
    expect(body.code).toBe("forbidden_directive");
  });
});
