/**
 * @keithk/deploy - Main entry point
 * 
 * A simple way to deploy websites with automatic SSL and subdomains
 */

// Core exports (types, utilities, database, auth)
export * from "./core";

// Server exports (specific exports to avoid conflicts)
// Export core server functionality

// Action exports (specific exports to avoid conflicts)
// Import action types and utilities specifically

// Re-export commonly used items at top level for convenience
export { 
  // Action definition functions
  defineScheduledAction,
  defineRouteAction,
  defineHookAction,
  defineAction
} from "./actions";

export {
  // Core types that are commonly used
  type SiteConfig,
  type ActionContext,
  type ActionResult,
  type Action,
  LogLevel
} from "./core";

export {
  // Server utilities
  startServer,
  executeCommand,
  buildSite
} from "./server";

export {
  // Logging utilities
  info,
  error,
  warn,
  debug,
  setLogLevel
} from "./core";