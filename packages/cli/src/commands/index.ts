
import { Command } from "commander";
import { registerRunCommand } from "./run";
import { registerBuildCommand } from "./build";
import { registerActionCommands } from "./actions";
import { registerServerCommands } from "./server";
import { registerProcessesCommand } from "./processes";
import { registerCaddyfileCommands } from "./caddyfile";
import { registerInitCommand } from "./init";
import { registerSiteCommands } from "./site";
import { registerSetupCommand } from "./setup";

/**
 * Register all CLI commands
 */
export function registerCommands(program: Command): void {
  registerInitCommand(program);
  registerSetupCommand(program);
  registerSiteCommands(program);
  registerRunCommand(program);
  registerBuildCommand(program);
  registerActionCommands(program);
  registerServerCommands(program);
  registerProcessesCommand(program);
  registerCaddyfileCommands(program);
}
