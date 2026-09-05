// ABOUTME: Provisions a Postgres database and role per site on the registered database server.
// ABOUTME: Attach creates (or re-keys) them and stores the site's DATABASE_URL; detach optionally drops them.

import { randomBytes } from "node:crypto";
import { SQL } from "bun";
import { decrypt, info, settingsModel, siteModel } from "@keithk/deploy-core";
import type { Site } from "@keithk/deploy-core";

export const DATABASE_URL_SETTING = "database_url";

/** Postgres identifiers are capped at 63 bytes. */
const MAX_IDENTIFIER_LENGTH = 63;

/**
 * The database and role name for a site: `site_` plus the site name with
 * anything outside [a-z0-9_] folded to `_`, truncated to Postgres's limit.
 */
export function databaseIdentifier(siteName: string): string {
  const cleaned = siteName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return `site_${cleaned}`.slice(0, MAX_IDENTIFIER_LENGTH);
}

/**
 * Build a site's connection string from the admin URL: same host, port and
 * query (so `sslmode=require` carries over), with the site's own credentials.
 */
export function buildSiteDatabaseUrl(
  adminUrl: string,
  role: string,
  password: string,
  databaseName: string
): string {
  const url = new URL(adminUrl);
  url.username = role;
  url.password = password;
  url.pathname = `/${databaseName}`;
  return url.toString();
}

/** Host and port of a connection string, for display without credentials. */
export function describeDatabaseServer(adminUrl: string): string {
  const url = new URL(adminUrl);
  return url.port ? `${url.hostname}:${url.port}` : url.hostname;
}

/** True when the string parses as a postgres:// or postgresql:// URL. */
export function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "postgres:" || url.protocol === "postgresql:") && !!url.hostname;
  } catch {
    return false;
  }
}

/** The registered database server's admin connection string, or null if none. */
export function getDatabaseServerUrl(): string | null {
  const stored = settingsModel.get(DATABASE_URL_SETTING);
  if (!stored) return null;
  try {
    return decrypt(stored);
  } catch {
    return null;
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function withAdminConnection<T>(fn: (sql: SQL) => Promise<T>): Promise<T> {
  const adminUrl = getDatabaseServerUrl();
  if (!adminUrl) {
    throw new Error("No database server is registered. Add one in Settings first.");
  }
  const sql = new SQL(adminUrl);
  try {
    return await fn(sql);
  } finally {
    await sql.close();
  }
}

/**
 * Create the site's role and database if they do not exist, set a fresh
 * password, and store the resulting DATABASE_URL on the site. Safe to run
 * again: an existing database keeps its data and only the password rotates.
 */
export async function attachDatabase(site: Site): Promise<Site> {
  const name = site.database_name || databaseIdentifier(site.name);
  const password = randomBytes(24).toString("base64url");
  const ident = quoteIdentifier(name);

  await withAdminConnection(async (sql) => {
    const roles = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${name}`;
    if (roles.length === 0) {
      await sql.unsafe(`CREATE ROLE ${ident} LOGIN PASSWORD ${quoteLiteral(password)}`);
      info(`Created database role ${name} for site ${site.name}`);
    } else {
      await sql.unsafe(`ALTER ROLE ${ident} WITH LOGIN PASSWORD ${quoteLiteral(password)}`);
    }

    // A non-superuser admin must belong to the owner role to hand it a database.
    await sql.unsafe(`GRANT ${ident} TO CURRENT_USER`);

    const databases = await sql`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (databases.length === 0) {
      await sql.unsafe(`CREATE DATABASE ${ident} OWNER ${ident}`);
      info(`Created database ${name} for site ${site.name}`);
    }
  });

  const adminUrl = getDatabaseServerUrl();
  if (!adminUrl) throw new Error("Database server was unregistered mid-attach");
  const databaseUrl = buildSiteDatabaseUrl(adminUrl, name, password, name);

  const updated = siteModel.update(site.id, {
    database_name: name,
    database_url: databaseUrl,
  });
  if (!updated) throw new Error(`Site ${site.id} disappeared while attaching a database`);
  return updated;
}

/**
 * Stop injecting DATABASE_URL for the site. With `drop`, also terminate open
 * connections and delete the database and role; otherwise the data stays and
 * a later attach picks it back up.
 */
export async function detachDatabase(
  site: Site,
  options: { drop?: boolean } = {}
): Promise<Site> {
  if (options.drop && site.database_name) {
    const name = site.database_name;
    const ident = quoteIdentifier(name);
    await withAdminConnection(async (sql) => {
      await sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${name}`;
      await sql.unsafe(`DROP DATABASE IF EXISTS ${ident}`);
      await sql.unsafe(`DROP ROLE IF EXISTS ${ident}`);
    });
    info(`Dropped database and role ${name} for site ${site.name}`);
  }

  const updated = siteModel.update(site.id, {
    database_name: options.drop ? null : site.database_name,
    database_url: null,
  });
  if (!updated) throw new Error(`Site ${site.id} disappeared while detaching its database`);
  return updated;
}

/**
 * Env vars the platform injects for the site's database, merged over user vars
 * at deploy time the same way PORT and DATA_DIR are.
 */
export function databaseEnvVars(site: Site): Record<string, string> {
  return site.database_url ? { DATABASE_URL: site.database_url } : {};
}
