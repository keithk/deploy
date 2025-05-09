
import { Command } from "commander";
import {
  initializeActionRegistry,
  listActions,
  runAction,
  createSiteAction
} from "../utils/action-utils";

/**
 * Register the actions commands
 */
export function registerActionCommands(program: Command): void {
  // List actions command
  program
    .command("actions")
    .description("List all registered actions")
    .action(async () => {
      await initializeActionRegistry();

      console.log("\nRegistered Actions:");
      console.log("------------------");

      const actionsOutput = listActions();
      console.log(actionsOutput);

      process.exit(0);
    });

  // Run action command
  program
    .command("action-run <actionId> [payload]")
    .description("Run an action manually")
    .action(async (actionId: string, payload = "{}") => {
      await initializeActionRegistry();

      console.log(`Running action "${actionId}"...`);

      // Parse payload if provided
      let payloadObj = {};
      try {
        payloadObj = JSON.parse(payload);
      } catch (error) {
        console.error(
          `Invalid JSON payload: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        process.exit(1);
      }

      // Execute the action
      const result = await runAction(actionId, payloadObj);

      console.log(`Result: ${result.success ? "Success" : "Failed"}`);
      console.log(`Message: ${result.message}`);

      if (result.data) {
        console.log("Data:", result.data);
      }

      if (!result.success) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    });

  // Create action command
  program
    .command("action-create <site> <type>")
    .description("Create a site-specific action configuration")
    .option("--id <id>", "Action ID")
    .option("--command <command>", "Command to run")
    .option("--schedule <schedule>", "Cron schedule")
    .option("--path <path>", "Webhook path")
    .option("--secret <secret>", "Webhook secret")
    .option("--trigger-build <boolean>", "Trigger build after action")
    .action(async (site: string, type: string, options) => {
      const result = await createSiteAction(site, type, options);

      if (result.success) {
        console.log(`✅ ${result.message}`);
        process.exit(0);
      } else {
        console.error(`❌ ${result.message}`);
        process.exit(1);
      }
    });
}
