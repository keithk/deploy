// ABOUTME: Tests for the pure helpers behind per-site database provisioning.
// ABOUTME: Covers identifier derivation, connection string construction, and URL validation.

import { describe, test, expect } from "bun:test";
import {
  buildSiteDatabaseUrl,
  databaseEnvVars,
  databaseIdentifier,
  describeDatabaseServer,
  isPostgresUrl,
} from "../database";
import type { Site } from "@keithk/deploy-core";

const ADMIN_URL = "postgres://upadmin:secret@db.example.com:11569/defaultdb?sslmode=require";

describe("databaseIdentifier", () => {
  test("prefixes the site name and folds unsafe characters", () => {
    expect(databaseIdentifier("blog")).toBe("site_blog");
    expect(databaseIdentifier("My-App.v2")).toBe("site_my_app_v2");
  });

  test("stays within Postgres's 63-byte identifier limit", () => {
    const long = "a".repeat(100);
    expect(databaseIdentifier(long)).toHaveLength(63);
    expect(databaseIdentifier(long).startsWith("site_")).toBe(true);
  });
});

describe("buildSiteDatabaseUrl", () => {
  test("swaps credentials and database, keeps host, port, and query", () => {
    const url = new URL(buildSiteDatabaseUrl(ADMIN_URL, "site_blog", "p4ss", "site_blog"));
    expect(url.username).toBe("site_blog");
    expect(url.password).toBe("p4ss");
    expect(url.hostname).toBe("db.example.com");
    expect(url.port).toBe("11569");
    expect(url.pathname).toBe("/site_blog");
    expect(url.searchParams.get("sslmode")).toBe("require");
  });

  test("does not leak the admin password", () => {
    expect(buildSiteDatabaseUrl(ADMIN_URL, "site_x", "pw", "site_x")).not.toContain("secret");
  });
});

describe("describeDatabaseServer", () => {
  test("reports host and port without credentials", () => {
    expect(describeDatabaseServer(ADMIN_URL)).toBe("db.example.com:11569");
    expect(describeDatabaseServer("postgres://u:p@localhost/db")).toBe("localhost");
  });
});

describe("isPostgresUrl", () => {
  test("accepts postgres and postgresql schemes", () => {
    expect(isPostgresUrl(ADMIN_URL)).toBe(true);
    expect(isPostgresUrl("postgresql://u:p@host/db")).toBe(true);
  });

  test("rejects other schemes and garbage", () => {
    expect(isPostgresUrl("mysql://u:p@host/db")).toBe(false);
    expect(isPostgresUrl("not a url")).toBe(false);
    expect(isPostgresUrl("")).toBe(false);
  });
});

describe("databaseEnvVars", () => {
  test("injects DATABASE_URL only when a database is attached", () => {
    expect(databaseEnvVars({ database_url: "postgres://x" } as Site)).toEqual({
      DATABASE_URL: "postgres://x",
    });
    expect(databaseEnvVars({ database_url: null } as Site)).toEqual({});
  });
});
