import { Command } from "commander";
import chalk from "chalk";
import {
  initializeActionRegistry,
  listActions,
  runAction,
  createSiteAction
} from "../utils/action-utils";
import { error, info } from "../../core";

/**
 * List all registered actions
 */
async function listActionsCommand(): Promise<void> {
  try {
    await initializeActionRegistry();

    console.log(chalk.bold("\nRegistered Actions:"));
    console.log("─".repeat(50));

    const actionsOutput = listActions();

    if (actionsOutput.trim()) {
      console.log(actionsOutput);
      console.log(chalk.gray("\nTo run an action, use the ID shown above:"));
      console.log(chalk.blue("  deploy actions run <action-id>"));
      console.log(chalk.gray("Example:"));
      console.log(chalk.blue("  deploy actions run test-action"));
    } else {
      console.log(
        chalk.gray("No actions found. Create some actions to get started.")
      );
      console.log(chalk.gray("\nTo create an action, run:"));
      console.log(chalk.blue("  deploy actions create <site> <type>"));
    }

    process.exit(0);
  } catch (err) {
    error(
      `Failed to list actions: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    process.exit(1);
  }
}

/**
 * Run an action manually
 */
async function runActionCommand(
  actionId: string,
  payload = "{}"
): Promise<void> {
  try {
    await initializeActionRegistry();

    info(`Running action "${actionId}"...`);

    // Parse payload if provided
    let payloadObj = {};
    try {
      payloadObj = JSON.parse(payload);
    } catch (parseError) {
      error(
        `Invalid JSON payload: ${
          parseError instanceof Error ? parseError.message : String(parseError)
        }`
      );
      console.log(chalk.gray("\nExample valid payload:"));
      console.log(
        chalk.blue('  deploy actions run my-action \'{"key": "value"}\'')
      );
      process.exit(1);
    }

    // Execute the action
    const result = await runAction(actionId, payloadObj);

    if (result.success) {
      console.log(chalk.green(`✅ Action completed successfully`));
      console.log(`Message: ${result.message}`);

      if (result.data) {
        console.log("Data:", result.data);
      }

      process.exit(0);
    } else {
      console.log(chalk.red(`❌ Action failed`));
      console.log(`Message: ${result.message}`);
      process.exit(1);
    }
  } catch (err) {
    error(
      `Failed to run action: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    process.exit(1);
  }
}

/**
 * Create a site-specific action
 */
async function createActionCommand(
  site: string,
  type: string,
  options: any
): Promise<void> {
  try {
    const result = await createSiteAction(site, type, options);

    if (result.success) {
      console.log(chalk.green(`✅ ${result.message}`));
      console.log(chalk.gray("\nNext steps:"));
      console.log(chalk.blue("  deploy actions list    # View all actions"));
      console.log(
        chalk.blue(
          `  deploy actions run ${
            options.id || `${site}-${type}`
          }  # Test your new action`
        )
      );
    } else {
      error(`❌ ${result.message}`);
      process.exit(1);
    }
  } catch (err) {
    error(
      `Failed to create action: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    process.exit(1);
  }
}

/**
 * Register the actions commands
 */
export function registerActionCommands(program: Command): void {
  const actionsCommand = program
    .command("actions")
    .description("Manage actions");

  actionsCommand
    .command("list")
    .description("List all registered actions")
    .action(listActionsCommand);

  actionsCommand
    .command("run")
    .description("Run an action manually")
    .argument("<actionId>", "ID of the action to run")
    .argument("[payload]", "JSON payload to pass to the action", "{}")
    .action(runActionCommand);

  actionsCommand
    .command("create")
    .description("Create a site-specific action configuration")
    .argument("<site>", "Site name")
    .argument("<type>", "Action type (webhook, scheduled, hook, custom)")
    .option("--id <id>", "Action ID")
    .option("--command <command>", "Command to run")
    .option("--schedule <schedule>", "Cron schedule (for scheduled actions)")
    .option("--path <path>", "Webhook path (for webhook actions)")
    .option("--secret <secret>", "Webhook secret (for webhook actions)")
    .option("--trigger-build", "Trigger build after action")
    .action(createActionCommand);
}
