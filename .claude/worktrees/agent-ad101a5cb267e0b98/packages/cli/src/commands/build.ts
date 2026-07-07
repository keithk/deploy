
import { Command } from "commander";
import chalk from "chalk";
import { buildAllSites, buildSite } from "../utils/build-utils";

/**
 * Register the build command
 */
export function registerBuildCommand(program: Command): void {
  program
    .command("build")
    .description("Build all static-build sites")
    .option("-s, --site <name>", "Build a specific site")
    .action(async (options) => {
      try {
        if (options.site) {
          // Build a specific site
          const siteName = options.site;
          console.log(chalk.blue(`🔨 Building site: ${chalk.bold(siteName)}`));

          const result = await buildSite(siteName);

          if (result.success) {
            console.log(chalk.green(`✅ ${result.message}`));
          } else {
            console.log(chalk.red(`❌ ${result.message}`));
            process.exit(1);
          }
        } else {
          // Build all sites
          console.log(chalk.blue("🔨 Building all sites..."));
          const result = await buildAllSites();

          if (result.builtSites.length > 0) {
            console.log(chalk.green("\n✅ Successfully built sites:"));
            result.builtSites.forEach((site) => 
              console.log(chalk.dim(`  • ${site}`))
            );
          }

          if (result.failedSites.length > 0) {
            console.log(chalk.red("\n❌ Failed to build sites:"));
            result.failedSites.forEach((site) => 
              console.log(chalk.dim(`  • ${site}`))
            );
            process.exit(1);
          }

          if (result.builtSites.length === 0) {
            console.log(chalk.yellow("No sites needed building"));
          }
        }
      } catch (err) {
        console.log(chalk.red(`❌ Build failed: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
      
      process.exit(0);
    });
}
