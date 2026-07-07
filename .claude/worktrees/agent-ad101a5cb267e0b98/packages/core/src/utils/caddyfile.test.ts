// ABOUTME: Tests for the simplified Caddyfile generation.
// ABOUTME: Validates wildcard routing configuration for the deploy server.

import { describe, test, expect } from "bun:test";
import { generateSimpleCaddyfile } from "./caddyfile";

describe("generateSimpleCaddyfile", () => {
  test("generates root domain configuration", () => {
    const content = generateSimpleCaddyfile("example.com", 3000);

    expect(content).toContain("example.com {");
    expect(content).toContain("reverse_proxy localhost:3000");
  });

  test("generates wildcard subdomain configuration", () => {
    const content = generateSimpleCaddyfile("example.com", 3000);

    expect(content).toContain("*.example.com {");
    expect(content).toContain("reverse_proxy localhost:3000");
  });

  test("includes security headers", () => {
    const content = generateSimpleCaddyfile("example.com", 3000);

    expect(content).toContain("X-Content-Type-Options nosniff");
    expect(content).toContain("X-Frame-Options");
    expect(content).toContain("Strict-Transport-Security");
  });

  test("includes compression settings", () => {
    const content = generateSimpleCaddyfile("example.com", 3000);

    expect(content).toContain("encode");
    expect(content).toContain("gzip");
    expect(content).toContain("zstd");
  });

  test("includes health check endpoint", () => {
    const content = generateSimpleCaddyfile("example.com", 3000);

    expect(content).toContain("health_uri /health");
  });

  test("uses custom port when specified", () => {
    const content = generateSimpleCaddyfile("example.com", 8080);

    expect(content).toContain("localhost:8080");
  });
});
