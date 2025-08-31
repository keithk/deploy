/**
 * Union Types and Type Guards
 * Handles legacy process data vs new site data structures
 */

import type { SiteConfig } from '../core/types/site';
import type { ProcessInfo, ProcessRegistryEntry } from '../core/database/models/process';

/**
 * Legacy process data structure (for backward compatibility)
 */
export interface LegacyProcessData {
  site: string;
  port: number;
  pid?: number;
  type: string;
  script: string;
  cwd: string;
  env?: Record<string, string>;
  startTime: Date | number;
  status: string;
  // Legacy fields
  name?: string;
  path?: string;
  route?: string;
}

/**
 * Union type for process or site data
 */
export type ProcessOrSiteData = ProcessInfo | ProcessRegistryEntry | SiteConfig | LegacyProcessData;

/**
 * Type guard to check if data is ProcessInfo
 */
export function isProcessInfo(data: unknown): data is ProcessInfo {
  return (
    typeof data === 'object' &&
    data !== null &&
    'site' in data &&
    'port' in data &&
    'type' in data &&
    'script' in data &&
    'cwd' in data &&
    'startTime' in data &&
    'status' in data &&
    typeof (data as any).site === 'string' &&
    typeof (data as any).port === 'number' &&
    typeof (data as any).type === 'string' &&
    typeof (data as any).script === 'string' &&
    typeof (data as any).cwd === 'string' &&
    typeof (data as any).status === 'string'
  );
}

/**
 * Type guard to check if data is ProcessRegistryEntry
 */
export function isProcessRegistryEntry(data: unknown): data is ProcessRegistryEntry {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'site' in data &&
    'port' in data &&
    'startTime' in data &&
    'type' in data &&
    'script' in data &&
    'cwd' in data &&
    'status' in data &&
    typeof (data as any).id === 'string' &&
    typeof (data as any).site === 'string' &&
    typeof (data as any).port === 'number' &&
    typeof (data as any).startTime === 'number' &&
    typeof (data as any).type === 'string' &&
    typeof (data as any).script === 'string' &&
    typeof (data as any).cwd === 'string' &&
    typeof (data as any).status === 'string'
  );
}

/**
 * Type guard to check if data is SiteConfig
 */
export function isSiteConfig(data: unknown): data is SiteConfig {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    'path' in data &&
    'route' in data &&
    'subdomain' in data &&
    typeof (data as any).type === 'string' &&
    typeof (data as any).path === 'string' &&
    typeof (data as any).route === 'string' &&
    typeof (data as any).subdomain === 'string'
  );
}

/**
 * Type guard to check if data is LegacyProcessData
 */
export function isLegacyProcessData(data: unknown): data is LegacyProcessData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'site' in data &&
    'port' in data &&
    'type' in data &&
    'script' in data &&
    'cwd' in data &&
    'status' in data &&
    typeof (data as any).site === 'string' &&
    typeof (data as any).port === 'number' &&
    // Could have legacy fields like name, path, route
    (!('id' in data) || typeof (data as any).id === 'undefined')
  );
}

/**
 * Normalize process or site data to a common interface
 */
export interface NormalizedData {
  id?: string;
  name: string;
  site: string;
  port?: number;
  pid?: number;
  type: string;
  path: string;
  script?: string;
  cwd?: string;
  status?: string;
  startTime?: Date | number;
  route?: string;
  subdomain?: string;
}

/**
 * Normalize different data types to a common interface
 */
export function normalizeData(data: ProcessOrSiteData): NormalizedData {
  if (isProcessRegistryEntry(data)) {
    return {
      id: data.id,
      name: data.site,
      site: data.site,
      port: data.port,
      pid: data.pid,
      type: data.type,
      path: data.cwd,
      script: data.script,
      cwd: data.cwd,
      status: data.status,
      startTime: data.startTime
    };
  }

  if (isProcessInfo(data)) {
    return {
      name: data.site,
      site: data.site,
      port: data.port,
      pid: data.pid,
      type: data.type,
      path: data.cwd,
      script: data.script,
      cwd: data.cwd,
      status: data.status,
      startTime: data.startTime
    };
  }

  if (isSiteConfig(data)) {
    return {
      name: data.subdomain,
      site: data.subdomain,
      port: data.proxyPort || data.devPort,
      type: data.type,
      path: data.path,
      route: data.route,
      subdomain: data.subdomain,
      script: data.entryPoint
    };
  }

  if (isLegacyProcessData(data)) {
    return {
      name: data.name || data.site,
      site: data.site,
      port: data.port,
      pid: data.pid,
      type: data.type,
      path: data.path || data.cwd,
      script: data.script,
      cwd: data.cwd,
      status: data.status,
      startTime: data.startTime,
      route: data.route
    };
  }

  // Fallback for unknown data types
  throw new Error(`Unknown data type: ${typeof data}`);
}

/**
 * Extract site name from various data types
 */
export function extractSiteName(data: ProcessOrSiteData): string {
  if (isProcessRegistryEntry(data) || isProcessInfo(data) || isLegacyProcessData(data)) {
    return data.site;
  }
  if (isSiteConfig(data)) {
    return data.subdomain;
  }
  throw new Error('Cannot extract site name from unknown data type');
}

/**
 * Extract port from various data types
 */
export function extractPort(data: ProcessOrSiteData): number | undefined {
  if (isProcessRegistryEntry(data) || isProcessInfo(data) || isLegacyProcessData(data)) {
    return data.port;
  }
  if (isSiteConfig(data)) {
    return data.proxyPort || data.devPort;
  }
  return undefined;
}