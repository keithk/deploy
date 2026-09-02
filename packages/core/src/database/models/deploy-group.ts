// ABOUTME: Model for deploy group CRUD and site membership management.
// ABOUTME: Returns each named group with its current member sites.

import { randomUUID } from "node:crypto";
import { Database } from "../database";
import type { DeployGroup, DeployGroupWithSites, Site } from "../schema";

export class DeployGroupModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  public create(name: string, siteIds: string[] = []): DeployGroupWithSites {
    const group: DeployGroup = {
      id: randomUUID(),
      name,
      created_at: new Date().toISOString(),
    };

    const transaction = this.db.getConnection().transaction(() => {
      this.db.prepare(
        `INSERT INTO deploy_groups (id, name, created_at) VALUES (?, ?, ?)`
      ).run(group.id, group.name, group.created_at);
      this.replaceSites(group.id, siteIds);
    });
    transaction();

    return this.findById(group.id)!;
  }

  public findAll(): DeployGroupWithSites[] {
    return this.db
      .query<DeployGroup>(`SELECT * FROM deploy_groups ORDER BY name COLLATE NOCASE`)
      .map((group) => ({ ...group, sites: this.findSites(group.id) }));
  }

  public findById(id: string): DeployGroupWithSites | null {
    const groups = this.db.query<DeployGroup>(
      `SELECT * FROM deploy_groups WHERE id = ? LIMIT 1`,
      [id]
    );
    return groups.length > 0
      ? { ...groups[0], sites: this.findSites(groups[0].id) }
      : null;
  }

  public findByName(name: string): DeployGroup | null {
    const groups = this.db.query<DeployGroup>(
      `SELECT * FROM deploy_groups WHERE name = ? COLLATE NOCASE LIMIT 1`,
      [name]
    );
    return groups[0] ?? null;
  }

  public update(
    id: string,
    data: { name?: string; siteIds?: string[] }
  ): DeployGroupWithSites | null {
    if (!this.findById(id)) return null;

    const transaction = this.db.getConnection().transaction(() => {
      if (data.name !== undefined) {
        this.db.prepare(`UPDATE deploy_groups SET name = ? WHERE id = ?`).run(data.name, id);
      }
      if (data.siteIds !== undefined) {
        this.replaceSites(id, data.siteIds);
      }
    });
    transaction();

    return this.findById(id);
  }

  public delete(id: string): boolean {
    if (!this.findById(id)) return false;
    const transaction = this.db.getConnection().transaction(() => {
      this.db.prepare(`DELETE FROM deploy_group_sites WHERE group_id = ?`).run(id);
      this.db.prepare(`DELETE FROM deploy_groups WHERE id = ?`).run(id);
    });
    transaction();
    return true;
  }

  private findSites(groupId: string): Site[] {
    return this.db.query<Site>(
      `SELECT sites.* FROM sites
       INNER JOIN deploy_group_sites ON deploy_group_sites.site_id = sites.id
       WHERE deploy_group_sites.group_id = ?
       ORDER BY sites.name COLLATE NOCASE`,
      [groupId]
    );
  }

  private replaceSites(groupId: string, siteIds: string[]): void {
    this.db.prepare(`DELETE FROM deploy_group_sites WHERE group_id = ?`).run(groupId);
    const insert = this.db.prepare(
      `INSERT INTO deploy_group_sites (group_id, site_id) VALUES (?, ?)`
    );
    for (const siteId of new Set(siteIds)) {
      insert.run(groupId, siteId);
    }
  }
}

export const deployGroupModel = new DeployGroupModel();
