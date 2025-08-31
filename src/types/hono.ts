/**
 * Hono Context Type Extensions
 * Provides proper typing for Hono context with custom variables
 */

import { Context } from 'hono';

/**
 * User information from authentication
 */
export interface AuthenticatedUser {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

/**
 * Site data from database queries
 */
export interface SiteData {
  user_id: number;
  name: string;
  path: string;
  type?: string;
  subdomain?: string;
  domain?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Variables available in Hono context
 */
export interface HonoVariables {
  user: AuthenticatedUser;
  site?: SiteData;
}

/**
 * Typed Hono Context
 */
export type HonoContext = Context<{ Variables: HonoVariables }>;

/**
 * Context with authenticated user
 */
export type AuthenticatedContext = Context<{ Variables: { user: AuthenticatedUser } }>;

/**
 * Admin-specific context with additional admin variables
 */
export type AdminContext = Context<{ Variables: HonoVariables & { isAdmin: true } }>;

/**
 * General application context
 */
export type AppContext = Context<{ Variables: HonoVariables }>;

/**
 * Type guard to check if user is authenticated
 */
export function isAuthenticatedUser(user: unknown): user is AuthenticatedUser {
  return (
    typeof user === 'object' &&
    user !== null &&
    'id' in user &&
    'username' in user &&
    'is_admin' in user &&
    typeof (user as any).id === 'number' &&
    typeof (user as any).username === 'string' &&
    typeof (user as any).is_admin === 'boolean'
  );
}

/**
 * Type guard to check if site data is valid
 */
export function isSiteData(site: unknown): site is SiteData {
  return (
    typeof site === 'object' &&
    site !== null &&
    'user_id' in site &&
    'name' in site &&
    'path' in site &&
    typeof (site as any).user_id === 'number' &&
    typeof (site as any).name === 'string' &&
    typeof (site as any).path === 'string'
  );
}