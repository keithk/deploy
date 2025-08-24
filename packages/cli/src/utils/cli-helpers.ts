// CLI Utility functions for consistent user experience
import chalk from "chalk";
import ora from "ora";
import { error as logError } from "@keithk/deploy-core";

/**
 * Exit codes for consistent error handling
 */
export const ExitCodes = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_ARGUMENT: 2,
  FILE_NOT_FOUND: 3,
  PERMISSION_DENIED: 4,
  NETWORK_ERROR: 5,
  TIMEOUT: 6
} as const;

/**
 * Consistent error formatting and logging
 */
export function handleCommandError(
  error: unknown,
  context: string,
  exitCode: number = ExitCodes.GENERAL_ERROR,
  showStack?: boolean
): never {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Log to system
  logError(`${context}: ${errorMessage}`);
  
  // Display to user
  console.error(chalk.red(`❌ ${errorMessage}`));
  
  if (showStack && error instanceof Error && error.stack) {
    console.error(chalk.dim(error.stack));
  }
  
  process.exit(exitCode);
}

/**
 * Validate that a string is not empty and return normalized value
 */
export function validateRequiredString(
  value: string | undefined,
  fieldName: string
): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${fieldName} is required and cannot be empty`);
  }
  return value.trim();
}

/**
 * Validate and parse port number
 */
export function validatePort(port: string): number {
  const portNum = parseInt(port);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    throw new Error(`Invalid port: ${port}. Port must be a number between 1-65535`);
  }
  return portNum;
}

/**
 * Validate log level
 */
export function validateLogLevel(level: string): number {
  const levelNum = parseInt(level);
  if (isNaN(levelNum) || levelNum < 0 || levelNum > 4) {
    throw new Error(`Invalid log level: ${level}. Must be 0 (none), 1 (error), 2 (warn), 3 (info), or 4 (debug)`);
  }
  return levelNum;
}

/**
 * Create a spinner with consistent styling
 */
export function createSpinner(text: string): any {
  return ora({
    text,
    color: 'blue',
    spinner: 'dots'
  });
}

/**
 * Display success message with consistent formatting
 */
export function showSuccess(message: string): void {
  console.log(chalk.green(`✅ ${message}`));
}

/**
 * Display warning message with consistent formatting
 */
export function showWarning(message: string): void {
  console.log(chalk.yellow(`⚠️  ${message}`));
}

/**
 * Display info message with consistent formatting
 */
export function showInfo(message: string): void {
  console.log(chalk.blue(`ℹ️  ${message}`));
}

/**
 * Display error message with consistent formatting (without exiting)
 */
export function showError(message: string): void {
  console.log(chalk.red(`❌ ${message}`));
}

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Format command usage hints
 */
export function formatUsageHint(command: string, description?: string): string {
  const hint = chalk.dim(`Usage: deploy ${command}`);
  return description ? `${hint}\n${chalk.dim(description)}` : hint;
}

/**
 * Create standardized help text sections
 */
export function createHelpSection(title: string, items: Array<{ command: string; description: string }>): string {
  const sections = [`\n${chalk.bold(title)}:`];
  items.forEach(({ command, description }) => {
    sections.push(`  ${chalk.cyan(command)} - ${chalk.dim(description)}`);
  });
  return sections.join('\n');
}

/**
 * Sanitize site name to be filesystem and URL safe
 */
export function sanitizeSiteName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/**
 * Check if we're in a valid DialUpDeploy project directory
 */
export function validateProjectDirectory(): { valid: boolean; message?: string } {
  const fs = require('fs');
  const path = require('path');
  
  const cwd = process.cwd();
  const dialupDir = path.join(cwd, '.dialup');
  const sitesDir = path.join(cwd, 'sites');
  
  if (!fs.existsSync(dialupDir)) {
    return {
      valid: false,
      message: `Not a DialUpDeploy project. Missing .dialup directory.\nRun 'deploy init' to initialize a new project.`
    };
  }
  
  if (!fs.existsSync(sitesDir)) {
    return {
      valid: false,
      message: `Not a DialUpDeploy project. Missing sites directory.\nRun 'deploy init' to initialize a new project.`
    };
  }
  
  return { valid: true };
}

/**
 * Show available sites when a site is not found
 */
export async function showAvailableSites(): Promise<void> {
  try {
    const { getSites } = await import("./site-manager");
    const sites = await getSites();
    
    if (sites.length > 0) {
      console.log(chalk.dim("\nAvailable sites:"));
      sites.forEach((site: any) => {
        console.log(chalk.dim(`  • ${site.subdomain}`));
      });
      console.log(chalk.dim("\nRun 'deploy site list' for detailed site information"));
    } else {
      console.log(chalk.dim("\nNo sites found. Run 'deploy site create <name>' to create your first site"));
    }
  } catch (error) {
    console.log(chalk.dim("\nRun 'deploy site list' to see available sites"));
  }
}

/**
 * Format file path for display (shorten long paths)
 */
export function formatPath(path: string, maxLength: number = 60): string {
  if (path.length <= maxLength) {
    return path;
  }
  
  const parts = path.split('/');
  if (parts.length <= 3) {
    return path;
  }
  
  return `.../${parts.slice(-2).join('/')}`;
}