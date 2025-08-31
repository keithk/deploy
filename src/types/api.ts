/**
 * API Type Definitions
 * Provides proper typing for API requests and responses
 */

/**
 * Base API response structure
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Create site request payload
 */
export interface CreateSiteRequest {
  name: string;
  type?: 'static' | 'dynamic' | 'passthrough' | 'static-build' | 'built-in' | 'docker';
  force?: boolean;
  template?: string;
  gitUrl?: string;
  branch?: string;
}

/**
 * Edit session request payload
 */
export interface EditSessionRequest {
  message?: string;
  commitChanges?: boolean;
  userId?: number;
}

/**
 * File operation request payload
 */
export interface FileOperationRequest {
  path: string;
  content?: string;
  type?: 'file' | 'directory';
  encoding?: 'utf8' | 'base64';
}

/**
 * Process operation request payload
 */
export interface ProcessRequest {
  action: 'start' | 'stop' | 'restart' | 'status';
  site?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Package manager request payload
 */
export interface PackageManagerRequest {
  action: 'install' | 'uninstall' | 'update' | 'list';
  packageName?: string;
  version?: string;
  isDev?: boolean;
  args?: string[];
}

/**
 * Git operation request payload
 */
export interface GitOperationRequest {
  action: 'commit' | 'push' | 'pull' | 'status' | 'branch' | 'merge';
  message?: string;
  branch?: string;
  remote?: string;
  files?: string[];
}

/**
 * Type guards for request validation
 */

export function isCreateSiteRequest(data: unknown): data is CreateSiteRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    'name' in data &&
    typeof (data as any).name === 'string' &&
    (data as any).name.trim().length > 0
  );
}

export function isEditSessionRequest(data: unknown): data is EditSessionRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    (!('message' in data) || typeof (data as any).message === 'string')
  );
}

export function isFileOperationRequest(data: unknown): data is FileOperationRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    'path' in data &&
    typeof (data as any).path === 'string'
  );
}

export function isProcessRequest(data: unknown): data is ProcessRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    'action' in data &&
    ['start', 'stop', 'restart', 'status'].includes((data as any).action)
  );
}

/**
 * Utility type helpers
 */

export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidPort(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && value < 65536;
}