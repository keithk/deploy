// ABOUTME: CLI commands for managing dashboard authentication.
// ABOUTME: Allows setting or resetting the admin password from the command line.

import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { settingsModel, Database } from "@keithk/deploy-core";
import { join } from "path";

const PASSWORD_HASH_KEY = "password_hash";

/**
 * Set or reset the dashboard password
 */
async function setPassword(): Promise<void> {
  // Ensure database is initialized
  const dataDir = join(process.cwd(), "data");
  Database.getInstance({ dataDir });

  const hasExisting = settingsModel.get(PASSWORD_HASH_KEY) !== null;

  if (hasExisting) {
    console.log(chalk.yellow("A password is already set. This will replace it.\n"));
  }

  const answers = await inquirer.prompt([
    {
      type: "password",
      name: "password",
      message: "New password (min 8 characters):",
      mask: "*",
      validate: (input: string) => {
        if (!input || input.length < 8) {
          return "Password must be at least 8 characters";
        }
        return true;
      }
    },
    {
      type: "password",
      name: "confirm",
      message: "Confirm password:",
      mask: "*",
      validate: (input: string, answers: { password: string }) => {
        if (input !== answers.password) {
          return "Passwords do not match";
        }
        return true;
      }
    }
  ]);

  const hash = await Bun.password.hash(answers.password, {
    algorithm: "argon2id",
  });
  settingsModel.set(PASSWORD_HASH_KEY, hash);

  console.log(chalk.green("\nPassword updated. Existing sessions remain valid."));
}

/**
 * Register auth CLI commands
 */
export function registerAuthCommands(program: Command): void {
  const authCommand = program
    .command("auth")
    .description("Manage dashboard authentication");

  authCommand
    .command("set-password")
    .description("Set or reset the dashboard password")
    .action(setPassword);
}
