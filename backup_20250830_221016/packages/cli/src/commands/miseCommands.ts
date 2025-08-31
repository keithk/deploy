import { Command } from "commander";
import { migrateToMise, listMiseSites } from "./mise";

/**
 * Register mise-related commands
 */
export function registerMiseCommands(program: Command): void {
  const miseCommand = program
    .command("mise")
    .description("Mise runtime management commands");

  // mise migrate <site-name>
  miseCommand
    .command("migrate <site-name>")
    .description("Generate mise configuration for a site")
    .option("-r, --root <dir>", "Sites directory", "./sites")
    .option("-f, --force", "Overwrite existing .mise.toml files")
    .action(async (siteName: string, options) => {
      await migrateToMise(siteName, options.root);
    });

  // mise list
  miseCommand
    .command("list")
    .description("List sites and their mise status")
    .option("-r, --root <dir>", "Sites directory", "./sites")
    .action(async (options) => {
      await listMiseSites(options.root);
    });
}