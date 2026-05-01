// ABOUTME: Tests for the proxy.ts pure helpers.
// ABOUTME: Currently covers IP-with-port stripping for X-Forwarded-For sanitization.

import { describe, test, expect } from "bun:test";
import { stripIpPort } from "../src/utils/proxy";

describe("stripIpPort", () => {
  test("bare IPv4 stays unchanged", () => {
    expect(stripIpPort("192.0.2.1")).toBe("192.0.2.1");
  });

  test("IPv4 with port loses the port", () => {
    expect(stripIpPort("192.0.2.1:60527")).toBe("192.0.2.1");
  });

  test("bare IPv6 stays unchanged", () => {
    expect(stripIpPort("2001:db8::1")).toBe("2001:db8::1");
  });

  test("bracketed IPv6 with port loses the port and brackets", () => {
    expect(stripIpPort("[2001:db8::1]:443")).toBe("2001:db8::1");
  });

  test("comma-separated list keeps only the first entry", () => {
    expect(stripIpPort("192.0.2.1:60527, 198.51.100.2")).toBe("192.0.2.1");
  });

  test("loopback fallback unchanged", () => {
    expect(stripIpPort("127.0.0.1")).toBe("127.0.0.1");
  });
});
