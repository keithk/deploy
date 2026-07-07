import { Command } from "commander";
import { resolve } from "path";
import chalk from "chalk";
import { getCodemod, listCodemods } from "../codemods";
import { info, warn, error } from "@keithk/deploy-core";

/**
 * Run a specific codemod
 */
async function runCodemod(
  codemodName: string,
  options: { dryRun?: boolean; verbose?: boolean; force?: boolean } = {}
): Promise<void> {
  const codemod = getCodemod(codemodName);
  
  if (!codemod) {
    error(`Codemod '${codemodName}' not found`);
    console.log("\nAvailable codemods:");
    listCodemods().forEach(({ name, description }) => {
      console.log(`  ${chalk.cyan(name)} - ${description}`);
    });
    process.exit(1);
  }
  
  const rootDir = process.env.ROOT_DIR
    ? resolve(process.env.ROOT_DIR, "..")
    : resolve(process.cwd());
  
  console.log(chalk.bold(`\n🔧 Running codemod: ${codemod.name} v${codemod.version}`));
  console.log(chalk.dim(codemod.description));
  console.log(chalk.dim(`Root directory: ${rootDir}`));
  
  if (options.dryRun) {
    console.log(chalk.yellow("\n⚠️  DRY RUN MODE - No changes will be made"));
  }
  
  console.log("");
  
  try {
    const result = await codemod.run(rootDir, options);
    
    if (result.errors.length > 0) {
      console.log(chalk.red("\n❌ Errors:"));
      result.errors.forEach(err => {
        console.log(chalk.red(`  • ${err}`));
      });
    }
    
    if (result.changes.length > 0) {
      console.log(chalk.bold("\n📝 Changes:"));
      result.changes.forEach(change => {
        let icon = "📄";
        let color = chalk.blue;
        
        switch (change.type) {
          case 'move':
            icon = "📦";
            color = chalk.green;
            break;
          case 'delete':
            icon = "🗑️";
            color = chalk.red;
            break;
          case 'create':
            icon = "✨";
            color = chalk.cyan;
            break;
          case 'update':
            icon = "✏️";
            color = chalk.yellow;
            break;
        }
        
        console.log(`  ${icon} ${color(change.description)}`);
        
        if (options.verbose) {
          if (change.from) console.log(chalk.dim(`     From: ${change.from}`));
          if (change.to) console.log(chalk.dim(`     To:   ${change.to}`));
        }
      });
    } else {
      console.log(chalk.dim("\nNo changes needed"));
    }
    
    if (result.success && !options.dryRun && result.changes.length > 0) {
      console.log(chalk.green("\n✅ Migration completed successfully!"));
    } else if (options.dryRun && result.changes.length > 0) {
      console.log(chalk.yellow("\n⚠️  Dry run complete. Run without --dry-run to apply changes."));
    }
    
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    error(`Failed to run codemod: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/**
 * List available codemods
 */
function listAvailableCodemods(): void {
  const codemods = listCodemods();
  
  if (codemods.length === 0) {
    console.log(chalk.dim("No codemods available"));
    process.exit(0);
  }
  
  console.log(chalk.bold("\n📦 Available codemods:"));
  console.log("─".repeat(60));
  
  codemods.forEach(({ name, description, version }) => {
    console.log(`\n${chalk.cyan(name)} ${chalk.dim(`(v${version})`)}`);
    console.log(`  ${description}`);
  });
  
  console.log(chalk.dim("\nRun 'deploy migrate <codemod-name>' to apply a codemod"));
  process.exit(0);
}

/**
 * Register the migrate commands
 */
export function registerMigrateCommands(program: Command): void {
  const migrateCommand = program
    .command("migrate")
    .description("Run codemods to migrate breaking changes")
    .argument("[codemod]", "Name of the codemod to run")
    .option("-d, --dry-run", "Preview changes without applying them", false)
    .option("-v, --verbose", "Show detailed output", false)
    .option("-f, --force", "Force overwrite existing files", false)
    .action((codemodName, options) => {
      if (!codemodName) {
        listAvailableCodemods();
      } else {
        runCodemod(codemodName, options);
      }
    });
}