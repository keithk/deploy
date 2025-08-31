/**
 * Hono Context Type Extensions
 * Provides proper typing for Hono context with custom variables
 */

import type { Context } from 'hono';

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
  max_sites?: number;
}

/**
 * Variables available in Hono context
 */
export interface HonoVariables {
  user: AuthenticatedUser;
  session?: any;
}

/**
 * Application environment configuration
 */
export interface AppEnv {
  Variables: HonoVariables;
}

/**
 * General application context
 */
export type AppContext = {
  Variables: HonoVariables;
};

/**
 * Environment type for authenticated contexts
 */
export type AuthenticatedContext = {
  Variables: {
    user: AuthenticatedUser;
    session?: any;
  }
};

/**
 * Admin-specific context
 */
export type AdminContext = {
  Variables: {
    user: AuthenticatedUser & { is_admin: true };
    session?: any;
  }
};