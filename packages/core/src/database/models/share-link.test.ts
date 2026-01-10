// ABOUTME: Test file for ShareLink model operations.
// ABOUTME: Verifies create, find by token/site, delete, and expiration handling.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "../database";
import { ShareLinkModel } from "./share-link";
import { SiteModel } from "./site";
import { rmSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_DATA_DIR = join(import.meta.dir, "..", "..", "..", "test-data-share-link");

describe("ShareLinkModel", () => {
  let db: Database;
  let shareLinkModel: ShareLinkModel;
  let siteModel: SiteModel;
  let testSiteId: string;

  beforeEach(async () => {
    // Clean up test data directory
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });

    // Reset singleton to get fresh instance
    (Database as any).instance = undefined;
    db = Database.getInstance({ dataDir: TEST_DATA_DIR });
    await db.runMigrations();

    shareLinkModel = new ShareLinkModel();
    siteModel = new SiteModel();

    // Create a test site for share links
    const site = siteModel.create({
      name: "test-site",
      git_url: "https://github.com/test/repo.git",
      type: "auto",
    });
    testSiteId = site.id;
  });

  afterEach(() => {
    db.close();
    (Database as any).instance = undefined;
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  describe("create", () => {
    test("creates a share link with default expiration", () => {
      const link = shareLinkModel.create(testSiteId);

      expect(link.id).toBeDefined();
      expect(link.site_id).toBe(testSiteId);
      expect(link.token).toBeDefined();
      expect(link.token.length).toBe(64); // 32 bytes = 64 hex chars
      expect(link.created_at).toBeDefined();
      expect(link.expires_at).toBeDefined();

      // Default expiration should be 24 hours from now
      const expiresAt = new Date(link.expires_at);
      const now = new Date();
      const hoursDiff = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(hoursDiff).toBeGreaterThan(23);
      expect(hoursDiff).toBeLessThan(25);
    });

    test("creates a share link with custom expiration", () => {
      const link = shareLinkModel.create(testSiteId, 48);

      const expiresAt = new Date(link.expires_at);
      const now = new Date();
      const hoursDiff = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(hoursDiff).toBeGreaterThan(47);
      expect(hoursDiff).toBeLessThan(49);
    });

    test("generates unique tokens for each link", () => {
      const link1 = shareLinkModel.create(testSiteId);
      const link2 = shareLinkModel.create(testSiteId);

      expect(link1.token).not.toBe(link2.token);
      expect(link1.id).not.toBe(link2.id);
    });
  });

  describe("findByToken", () => {
    test("finds an existing share link by token", () => {
      const created = shareLinkModel.create(testSiteId);

      const found = shareLinkModel.findByToken(created.token);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.site_id).toBe(testSiteId);
    });

    test("returns null for non-existent token", () => {
      const found = shareLinkModel.findByToken("nonexistent-token");

      expect(found).toBeNull();
    });

    test("returns null for expired token", () => {
      // Create a link with 0 hours expiration (already expired)
      const link = shareLinkModel.create(testSiteId, 0);

      // Wait a moment to ensure expiration
      const found = shareLinkModel.findByToken(link.token);

      expect(found).toBeNull();
    });
  });

  describe("findBySiteId", () => {
    test("returns all share links for a site", () => {
      shareLinkModel.create(testSiteId);
      shareLinkModel.create(testSiteId);

      const links = shareLinkModel.findBySiteId(testSiteId);

      expect(links.length).toBe(2);
      expect(links[0].site_id).toBe(testSiteId);
      expect(links[1].site_id).toBe(testSiteId);
    });

    test("returns empty array for site with no links", () => {
      const links = shareLinkModel.findBySiteId("non-existent-site");

      expect(links).toEqual([]);
    });

    test("only returns links for the specified site", () => {
      const site2 = siteModel.create({
        name: "other-site",
        git_url: "https://github.com/test/other.git",
        type: "auto",
      });

      shareLinkModel.create(testSiteId);
      shareLinkModel.create(site2.id);

      const links = shareLinkModel.findBySiteId(testSiteId);

      expect(links.length).toBe(1);
      expect(links[0].site_id).toBe(testSiteId);
    });
  });

  describe("delete", () => {
    test("deletes an existing share link and returns true", () => {
      const created = shareLinkModel.create(testSiteId);

      const result = shareLinkModel.delete(created.id);

      expect(result).toBe(true);
      expect(shareLinkModel.findByToken(created.token)).toBeNull();
    });

    test("returns false for non-existent ID", () => {
      const result = shareLinkModel.delete("non-existent-id");

      expect(result).toBe(false);
    });
  });

  describe("deleteExpired", () => {
    test("removes expired share links", () => {
      // Create an expired link (0 hours)
      const expired = shareLinkModel.create(testSiteId, 0);
      // Create a valid link
      const valid = shareLinkModel.create(testSiteId, 24);

      shareLinkModel.deleteExpired();

      // Expired link should be gone
      const allLinks = shareLinkModel.findBySiteId(testSiteId);
      expect(allLinks.length).toBe(1);
      expect(allLinks[0].id).toBe(valid.id);
    });

    test("does nothing when no expired links exist", () => {
      shareLinkModel.create(testSiteId, 24);
      shareLinkModel.create(testSiteId, 48);

      shareLinkModel.deleteExpired();

      const links = shareLinkModel.findBySiteId(testSiteId);
      expect(links.length).toBe(2);
    });
  });
});
