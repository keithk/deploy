// ABOUTME: Unit tests for the compose-create validation logic exposed by sites.ts.
// ABOUTME: Pure-function coverage; doesn't touch the SQLite singleton.

import { describe, test, expect } from "bun:test";
import { validateCreateComposeBody } from "../src/api/sites";

const VALID_COMPOSE = `
services:
  cobalt:
    image: ghcr.io/imputnet/cobalt:11
    ports:
      - "9000:9000/tcp"
  watchtower:
    image: ghcr.io/containrrr/watchtower
`;

const baseBody = {
  source_type: "compose" as const,
  name: "cobalt",
  compose_yaml: VALID_COMPOSE,
  primary_service: "cobalt",
  primary_port: 9000,
};

describe("validateCreateComposeBody", () => {
  test("accepts a valid Cobalt-shaped body", () => {
    const result = validateCreateComposeBody(baseBody);
    expect(result.ok).toBe(true);
  });

  test("rejects missing compose_yaml", () => {
    const result = validateCreateComposeBody({ ...baseBody, compose_yaml: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/required/);
  });

  test("rejects missing primary_service", () => {
    const result = validateCreateComposeBody({ ...baseBody, primary_service: "" });
    expect(result.ok).toBe(false);
  });

  test("rejects missing primary_port", () => {
    const result = validateCreateComposeBody({ ...baseBody, primary_port: undefined as unknown as number });
    expect(result.ok).toBe(false);
  });

  test("rejects when primary_service is not in the compose file", () => {
    const result = validateCreateComposeBody({ ...baseBody, primary_service: "ghost" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not present/);
  });

  test("rejects when primary_port is not declared by the service", () => {
    const result = validateCreateComposeBody({ ...baseBody, primary_port: 4242 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/does not declare port 4242/);
  });

  test("forwards forbidden_directive code from compose validation", () => {
    const yaml = `
services:
  app:
    image: redis
    network_mode: host
    ports: ["6379:6379"]
`;
    const result = validateCreateComposeBody({
      ...baseBody,
      compose_yaml: yaml,
      primary_service: "app",
      primary_port: 6379,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("forbidden_directive");
      expect(result.error).toMatch(/network_mode/);
    }
  });

  test("rejects malformed YAML with parse error", () => {
    const result = validateCreateComposeBody({ ...baseBody, compose_yaml: "::\n::" });
    expect(result.ok).toBe(false);
  });

  test("rejects compose with no published-port services", () => {
    const yaml = `
services:
  app:
    image: redis
`;
    const result = validateCreateComposeBody({
      ...baseBody,
      compose_yaml: yaml,
      primary_service: "app",
      primary_port: 6379,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("no_published_ports");
    }
  });
});
