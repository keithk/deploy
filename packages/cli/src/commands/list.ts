
import { Command } from "commander";
import { listSitesFormatted } from "../utils/site-manager";

/**
 * Register the list command
 */
export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List all available sites and their commands")
    .action(async () => {
      console.log("\nAvailable sites:");
      console.log("----------------");

      const sitesOutput = await listSitesFormatted();
      console.log(sitesOutput);

      process.exit(0);
    });
}
