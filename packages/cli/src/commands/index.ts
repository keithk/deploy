// ABOUTME: CLI command registration for the deploy tool.
// ABOUTME: Registers essential commands; legacy commands are disabled but preserved.

import { Command } from "commander";
import { registerActionCommands } from "./actions";
import { registerServerCommands } from "./server";
import { registerCaddyfileCommands } from "./caddyfile";
import { registerSetupCommand } from "./setup";
import { registerMigrateCommands } from "./migrate";
import { registerAdminCommands } from "./admin";

// Legacy commands - disabled in favor of dashboard-based management
// import { registerRunCommand } from "./run";
// import { registerBuildCommand } from "./build";
// import { registerProcessesCommand } from "./processes";
// import { registerInitCommand } from "./init";
// import { registerSiteCommands } from "./site";

/**
 * Register CLI commands.
 *
 * Essential commands:
 * - setup: Configure local or production environment
 * - start/dev/restart/doctor: Server management (from registerServerCommands)
 * - actions: Action management (list, run)
 * - caddyfile: Generate Caddyfile
 * - migrate: Database migrations
 * - admin: Admin user management
 *
 * Disabled commands (now handled via dashboard):
 * - site: Site management now via dashboard API
 * - processes: Managed automatically by deploy orchestrator
 * - build: Handled by deploy orchestrator
 * - run: Replaced by start/dev
 * - init: Replaced by setup
 */
export function registerCommands(program: Command): void {
  // Core commands
  registerSetupCommand(program);
  registerServerCommands(program);
  registerActionCommands(program);
  registerCaddyfileCommands(program);

  // Admin/migration commands
  registerMigrateCommands(program);
  registerAdminCommands(program);
}
