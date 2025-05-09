
import { Command } from "commander";
import { basename } from "path";
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
      const site = await findSiteByName(siteName);

      if (!site) {
        console.error(`Site "${siteName}" not found.`);
        process.exit(1);
      }

      if (!site.commands || !site.commands[commandName]) {
        console.error(
          `Command "${commandName}" not found for site "${siteName}".`
        );
        process.exit(1);
      }

      console.log(
        `Running command "${commandName}" for site "${siteName}": ${site.commands[commandName]}`
      );

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
    });
}
