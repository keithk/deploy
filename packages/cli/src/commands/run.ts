
import { Command } from "commander";
import { basename } from "path";
import chalk from "chalk";
import { findSiteByName } from "../utils/site-manager";
import { runPackageManagerCommand } from "../utils/package-manager";

/**
 * Register the run command
 */
export function registerRunCommand(program: Command): void {
  program
    .command("run <site> <command>")
    .description("Run a command for a specific site")
    .action(async (siteName: string, commandName: string) => {
      try {
        const site = await findSiteByName(siteName);

        if (!site) {
          console.log(chalk.red(`❌ Site "${chalk.bold(siteName)}" not found`));
          console.log(chalk.dim("Available sites:"));
          // Could list available sites here, but that might be too verbose
          console.log(chalk.dim("Run 'deploy site list' to see all sites"));
          process.exit(1);
        }

        if (!site.commands || !site.commands[commandName]) {
          console.log(chalk.red(`❌ Command "${chalk.bold(commandName)}" not found for site "${chalk.bold(siteName)}"`));
          
          if (site.commands && Object.keys(site.commands).length > 0) {
            console.log(chalk.dim("Available commands:"));
            Object.keys(site.commands).forEach(cmd => {
              console.log(chalk.dim(`  • ${cmd}`));
            });
          } else {
            console.log(chalk.dim("No commands defined for this site"));
          }
          process.exit(1);
        }

        console.log(chalk.blue(`🚀 Running "${chalk.bold(commandName)}" for ${chalk.bold(siteName)}`));
        console.log(chalk.dim(`Command: ${site.commands[commandName]}`));

        // Create environment with additional variables
        const env = {
          ...process.env,
          FLEXIWEB_SITE: siteName,
          FLEXIWEB_SITE_PATH: site.path,
          FLEXIWEB_SITE_URL: `http://localhost:${process.env.PORT || "3000"}${
            site.route
          }`
        };

        // Run the command
        const result = runPackageManagerCommand(site.path, commandName, env);

        process.exit(result.status || 0);
      } catch (err) {
        console.log(chalk.red(`❌ Failed to run command: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}
