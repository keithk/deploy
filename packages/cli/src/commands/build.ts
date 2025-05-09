
import { Command } from "commander";
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
      if (options.site) {
        // Build a specific site
        const siteName = options.site;
        console.log(`Building site: ${siteName}`);

        const result = await buildSite(siteName);

        if (result.success) {
          console.log(`\n✅ ${result.message}`);
          process.exit(0);
        } else {
          console.error(`\n❌ ${result.message}`);
          process.exit(1);
        }
      } else {
        // Build all sites
        const result = await buildAllSites();

        if (result.builtSites.length > 0) {
          console.log("\n✅ Successfully built sites:");
          result.builtSites.forEach((site) => console.log(`  - ${site}`));
        }

        if (result.failedSites.length > 0) {
          console.error("\n❌ Failed to build sites:");
          result.failedSites.forEach((site) => console.error(`  - ${site}`));
          process.exit(1);
        }

        console.log(`\n${result.message}`);
        process.exit(0);
      }
    });
}
