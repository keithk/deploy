/**
 * Centralized logging utility with configurable log levels
 */

// Log levels in order of verbosity
export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4
}

// Default log level - can be overridden via environment variable
let currentLogLevel = process.env.LOG_LEVEL
  ? parseInt(process.env.LOG_LEVEL)
  : LogLevel.WARN;

/**
 * Set the current log level
 * @param level The log level to set
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
  info(`Log level set to: ${LogLevel[level]}`);
}

/**
 * Get the current log level
 * @returns The current log level
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * Log an error message
 * @param message The message to log
 */
export function error(...args: any[]): void {
  if (currentLogLevel >= LogLevel.ERROR) {
    console.error("[ERROR]", ...args);
  }
}

/**
 * Log a warning message
 * @param message The message to log
 */
export function warn(...args: any[]): void {
  if (currentLogLevel >= LogLevel.WARN) {
    console.warn("[WARN]", ...args);
  }
}

/**
 * Log an info message
 * @param message The message to log
 */
export function info(...args: any[]): void {
  if (currentLogLevel >= LogLevel.INFO) {
    console.log(...args);
  }
}

/**
 * Log a debug message
 * @param message The message to log
 */
export function debug(...args: any[]): void {
  if (currentLogLevel >= LogLevel.DEBUG) {
    console.log("[DEBUG]", ...args);
  }
}
