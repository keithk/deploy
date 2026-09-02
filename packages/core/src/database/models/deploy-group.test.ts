// ABOUTME: Tests deploy group persistence and site membership replacement.
// ABOUTME: Verifies create, update, listing, and deletion behavior.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Database } from "../database";
import { DeployGroupModel } from "./deploy-group";
import { SiteModel } from "./site";

const TEST_DATA_DIR = join(import.meta.dir, "..", "..", "..", "test-data-deploy-group");

describe("DeployGroupModel", () => {
  let db: Database;
  let groups: DeployGroupModel;
  let sites: SiteModel;

  beforeEach(async () => {
    if (existsSync(TEST_DATA_DIR)) rmSync(TEST_DATA_DIR, { recursive: true });
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    (Database as unknown as { instance?: Database }).instance = undefined;
    db = Database.getInstance({ dataDir: TEST_DATA_DIR });
    await db.runMigrations();
    groups = new DeployGroupModel();
    sites = new SiteModel();
  });

  afterEach(() => {
    db.close();
    (Database as unknown as { instance?: Database }).instance = undefined;
    if (existsSync(TEST_DATA_DIR)) rmSync(TEST_DATA_DIR, { recursive: true });
  });

  test("creates a group with unique site memberships", () => {
    const first = sites.create({
      name: "at-one",
      type: "auto",
      git_url: "https://example.com/one",
      env_vars: '{"SHARED":"yes","FORUM":"one"}',
    });
    const second = sites.create({ name: "at-two", type: "auto", git_url: "https://example.com/two" });

    const group = groups.create("ATMob instances", [first.id, second.id, first.id]);

    expect(group.name).toBe("ATMob instances");
    expect(group.sites.map((site) => site.name)).toEqual(["at-one", "at-two"]);
    expect(group.sites[0].env_vars).toBe('{"SHARED":"yes","FORUM":"one"}');
    expect(groups.findAll()).toHaveLength(1);
  });

  test("updates name and replaces membership", () => {
    const first = sites.create({ name: "at-one", type: "auto", git_url: "https://example.com/one" });
    const second = sites.create({ name: "at-two", type: "auto", git_url: "https://example.com/two" });
    const group = groups.create("Old name", [first.id]);

    const updated = groups.update(group.id, { name: "All instances", siteIds: [second.id] });

    expect(updated?.name).toBe("All instances");
    expect(updated?.sites.map((site) => site.id)).toEqual([second.id]);
  });

  test("deletes the group and its memberships", () => {
    const site = sites.create({ name: "at-one", type: "auto", git_url: "https://example.com/one" });
    const group = groups.create("Instances", [site.id]);

    expect(groups.delete(group.id)).toBe(true);
    expect(groups.findById(group.id)).toBeNull();
    expect(db.query(`SELECT * FROM deploy_group_sites WHERE group_id = ?`, [group.id])).toHaveLength(0);
  });
});
