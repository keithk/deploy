// ABOUTME: Tests for reserved host detection used by on-demand TLS domain validation.
// ABOUTME: Reserved hosts serve the control plane itself and have no backing site record.

import { describe, test, expect } from "bun:test";
import { isReservedHost } from "../src/utils/reserved-hosts";

const PROJECT_DOMAIN = "keith.is";

describe("isReservedHost", () => {
  test("accepts the admin host", () => {
    expect(isReservedHost("admin.keith.is", PROJECT_DOMAIN)).toBe(true);
  });

  test("accepts the deploy host", () => {
    expect(isReservedHost("deploy.keith.is", PROJECT_DOMAIN)).toBe(true);
  });

  test("rejects hosts backed by an ordinary site", () => {
    expect(isReservedHost("blog.keith.is", PROJECT_DOMAIN)).toBe(false);
  });

  test("rejects a reserved name under a different project domain", () => {
    expect(isReservedHost("deploy.example.com", PROJECT_DOMAIN)).toBe(false);
  });

  test("rejects a reserved name used as a deeper subdomain", () => {
    expect(isReservedHost("deploy.keith.is.evil.com", PROJECT_DOMAIN)).toBe(false);
    expect(isReservedHost("x.deploy.keith.is", PROJECT_DOMAIN)).toBe(false);
  });

  test("rejects the bare project domain", () => {
    expect(isReservedHost("keith.is", PROJECT_DOMAIN)).toBe(false);
  });

  test("matches case-insensitively", () => {
    expect(isReservedHost("Deploy.Keith.IS", PROJECT_DOMAIN)).toBe(true);
  });
});
