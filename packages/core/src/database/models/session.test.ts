// ABOUTME: Test file for Session model operations.
// ABOUTME: Verifies create, find by token, delete, and expiration handling.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "../database";
import { SessionModel } from "./session";
import { rmSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_DATA_DIR = join(import.meta.dir, "..", "..", "..", "test-data-session");

describe("SessionModel", () => {
  let db: Database;
  let sessionModel: SessionModel;

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

    sessionModel = new SessionModel();
  });

  afterEach(() => {
    db.close();
    (Database as any).instance = undefined;
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  describe("create", () => {
    test("creates a session with default expiration", () => {
      const session = sessionModel.create();

      expect(session.id).toBeDefined();
      expect(session.token).toBeDefined();
      expect(session.token.length).toBe(64); // 32 bytes = 64 hex chars
      expect(session.created_at).toBeDefined();
      expect(session.expires_at).toBeDefined();

      // Default expiration should be 7 days from now
      const expiresAt = new Date(session.expires_at);
      const now = new Date();
      const daysDiff = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThan(6);
      expect(daysDiff).toBeLessThan(8);
    });

    test("creates a session with custom expiration", () => {
      const session = sessionModel.create(14);

      const expiresAt = new Date(session.expires_at);
      const now = new Date();
      const daysDiff = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThan(13);
      expect(daysDiff).toBeLessThan(15);
    });

    test("generates unique tokens for each session", () => {
      const session1 = sessionModel.create();
      const session2 = sessionModel.create();

      expect(session1.token).not.toBe(session2.token);
      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe("findByToken", () => {
    test("finds an existing session by token", () => {
      const created = sessionModel.create();

      const found = sessionModel.findByToken(created.token);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.token).toBe(created.token);
    });

    test("returns null for non-existent token", () => {
      const found = sessionModel.findByToken("nonexistent-token");

      expect(found).toBeNull();
    });

    test("returns null for expired token", () => {
      // Create a session with 0 days expiration (already expired)
      const session = sessionModel.create(0);

      const found = sessionModel.findByToken(session.token);

      expect(found).toBeNull();
    });
  });

  describe("delete", () => {
    test("deletes an existing session by token and returns true", () => {
      const created = sessionModel.create();

      const result = sessionModel.delete(created.token);

      expect(result).toBe(true);
      expect(sessionModel.findByToken(created.token)).toBeNull();
    });

    test("returns false for non-existent token", () => {
      const result = sessionModel.delete("non-existent-token");

      expect(result).toBe(false);
    });
  });

  describe("deleteExpired", () => {
    test("removes expired sessions", () => {
      // Create an expired session (0 days)
      const expired = sessionModel.create(0);
      // Create a valid session
      const valid = sessionModel.create(7);

      sessionModel.deleteExpired();

      // Expired session should be gone
      // Query directly since findByToken filters expired
      const allSessions = db.query<{ id: string }>("SELECT id FROM sessions");
      expect(allSessions.length).toBe(1);
      expect(allSessions[0].id).toBe(valid.id);
    });

    test("does nothing when no expired sessions exist", () => {
      sessionModel.create(7);
      sessionModel.create(14);

      sessionModel.deleteExpired();

      const allSessions = db.query<{ id: string }>("SELECT id FROM sessions");
      expect(allSessions.length).toBe(2);
    });
  });
});
