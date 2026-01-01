// ABOUTME: Type definitions for the simplified database schema.
// ABOUTME: Defines interfaces for sites, actions, share links, logs, sessions, and settings.

/**
 * Represents a deployed site (git-based deployment)
 */
export interface Site {
  id: string;
  name: string;           // subdomain
  git_url: string;
  branch: string;         // default: main
  type: 'auto' | 'passthrough';
  visibility: 'public' | 'private';
  status: 'running' | 'stopped' | 'building' | 'error';
  container_id: string | null;
  port: number | null;
  env_vars: string;       // JSON, encrypted
  persistent_storage: number;  // SQLite boolean: 0 = false, 1 = true
  autodeploy: number;          // SQLite boolean: 0 = false, 1 = true
  created_at: string;
  last_deployed_at: string | null;
}

/**
 * Represents an action record from the database (scheduled task, webhook handler, or hook)
 */
export interface DbAction {
  id: string;
  name: string;
  type: 'scheduled' | 'webhook' | 'hook' | 'custom';
  site_id: string | null;
  schedule: string | null;
  hook_event: string | null;
  code: string | null;
  git_url: string | null;
  entry_path: string | null;
  enabled: number;  // SQLite stores as integer
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
}

/**
 * Represents a temporary share link for private site access
 */
export interface ShareLink {
  id: string;
  site_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

/**
 * Represents a log entry for builds, runtime, or actions
 */
export interface Log {
  id: string;
  site_id: string | null;
  action_id: string | null;
  type: 'build' | 'runtime' | 'action';
  content: string;
  timestamp: string;
}

/**
 * Represents an authenticated session
 */
export interface Session {
  id: string;
  token: string;
  created_at: string;
  expires_at: string;
}

/**
 * Represents a key-value setting
 */
export interface Settings {
  key: string;
  value: string;
}
