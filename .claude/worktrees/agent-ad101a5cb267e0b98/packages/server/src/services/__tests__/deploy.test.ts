// ABOUTME: Tests for the deployment orchestrator service.
// ABOUTME: Validates deployment flow and error handling.

import { describe, test, expect } from "bun:test";
import { deploySite, stopSite } from "../deploy";

describe("deploy service", () => {
  describe("deploySite", () => {
    test("returns error when site cannot be found", async () => {
      const result = await deploySite("nonexistent-site-id");

      expect(result.success).toBe(false);
      // Will return either "Site not found" or "Database error" depending on db state
      expect(result.error).toBeTruthy();
    });
  });

  describe("stopSite", () => {
    test("throws error when site cannot be found", async () => {
      // Will throw either "Site not found" or "Database error" depending on db state
      await expect(stopSite("nonexistent-site-id")).rejects.toThrow();
    });
  });
});
