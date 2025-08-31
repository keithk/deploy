/**
 * Main Types Export
 * Centralized export for all type definitions
 */

// Export core types from existing files
export * from '../core/types';

// Export new type definitions (excluding hono which is now in core/types)
export * from './api';
export * from './union-types';

// Re-export important Bun types for convenience
export type { Subprocess } from 'bun';

// Utility types
export type NonEmptyArray<T> = [T, ...T[]];
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;