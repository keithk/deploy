
import { Command } from "commander";
import { join, resolve } from "path";
import { existsSync, mkdirSync, readdirSync } from "fs";
import chalk from "chalk";
import { debug, info, error } from "@dialup-deploy/core";

/**
 * Initialize a new DialUpDeploy project
 * @param directory The directory to initialize the project in
 * @param options Command options
 */
async function initProject(
  directory: string = ".",
  options: { force?: boolean } = {}
): Promise<void> {
  try {
    // Resolve the directory to an absolute path
    const projectDir = resolve(directory);

    // Check if the directory exists
    if (!existsSync(projectDir)) {
      console.log(`Creating directory: ${projectDir}`);
      mkdirSync(projectDir, { recursive: true });
    }

    // Check if the directory is empty or if force option is used
    const dirContents = readdirSync(projectDir);
    if (dirContents.length > 0 && !options.force) {
      error(
        `Directory ${projectDir} is not empty. Use --force to initialize anyway.`
      );
      return;
    }

    // Create the .dialup directory
    const dialupDir = join(projectDir, ".dialup");
    if (!existsSync(dialupDir)) {
      console.log(`Creating .dialup directory: ${dialupDir}`);
      mkdirSync(dialupDir, { recursive: true });
    }

    // Create the sites directory
    const sitesDir = join(projectDir, "sites");
    if (!existsSync(sitesDir)) {
      console.log(`Creating sites directory: ${sitesDir}`);
      mkdirSync(sitesDir, { recursive: true });
    }

    // Create the .dialup/actions directory
    const actionsDir = join(dialupDir, "actions");
    if (!existsSync(actionsDir)) {
      console.log(`Creating actions directory: ${actionsDir}`);
      mkdirSync(actionsDir, { recursive: true });
    }

    // Create the .dialup/caddy directory
    const caddyDir = join(dialupDir, "caddy");
    if (!existsSync(caddyDir)) {
      console.log(`Creating caddy directory: ${caddyDir}`);
      mkdirSync(caddyDir, { recursive: true });
    }

    // Create initial config.json
    const configPath = join(dialupDir, "config.json");
    if (!existsSync(configPath) || options.force) {
      console.log(`Creating initial config.json: ${configPath}`);
      const initialConfig = {
        actions: {
          enabled: true,
          webhookPath: "/webhook"
        }
      };

      await Bun.write(configPath, JSON.stringify(initialConfig, null, 2));
    }

    // Create .env file
    const envPath = join(projectDir, ".env");
    if (!existsSync(envPath) || options.force) {
      console.log(`Creating initial .env file: ${envPath}`);
      const envContent = `# DialUpDeploy Environment Variables
PROJECT_DOMAIN=localhost
ROOT_DIR=${join(projectDir, "sites")}
PORT=3000
`;

      await Bun.write(envPath, envContent);
    }

    // Create an example site
    const exampleSiteDir = join(sitesDir, "example");
    if (!existsSync(exampleSiteDir) || options.force) {
      console.log(`Creating example site: ${exampleSiteDir}`);
      mkdirSync(exampleSiteDir, { recursive: true });

      // Create site .dialup directory
      const siteDotDialupDir = join(exampleSiteDir, ".dialup");
      mkdirSync(siteDotDialupDir, { recursive: true });

      // Create site actions directory
      const siteActionsDir = join(siteDotDialupDir, "actions");
      mkdirSync(siteActionsDir, { recursive: true });

      // Create site config.json
      const siteConfigPath = join(siteDotDialupDir, "config.json");
      const siteConfig = {
        type: "static",
        subdomain: "example",
        default: true
      };

      await Bun.write(siteConfigPath, JSON.stringify(siteConfig, null, 2));

      // Create a simple index.html
      const indexPath = join(exampleSiteDir, "index.html");
      const indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to DialUpDeploy</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      color: #0066cc;
    }
    .card {
      background: #f9f9f9;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    code {
      background: #eee;
      padding: 2px 4px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <h1>🚀 Welcome to DialUpDeploy</h1>
  
  <div class="card">
    <h2>Your site is up and running!</h2>
    <p>This is an example site created by the initialization process. You can modify it or create new sites in the <code>sites</code> directory.</p>
  </div>
  
  <h2>Next Steps</h2>
  <ul>
    <li>Create more sites in the <code>sites</code> directory</li>
    <li>Configure your domains in <code>.dialup/config.json</code></li>
    <li>Create actions in <code>.dialup/actions</code> or <code>sites/your-site/.dialup/actions</code></li>
    <li>Run <code>deploy start</code> to start the server</li>
  </ul>
  
  <p>For more information, check out the <a href="https://github.com/keithk/flexiweb">documentation</a>.</p>
</body>
</html>`;

      await Bun.write(indexPath, indexContent);
    }

    console.log(
      chalk.green(`Project initialized successfully in ${projectDir}`)
    );
    console.log(`\nNext steps:`);
    console.log(`1. cd ${directory}`);
    console.log(`2. deploy start`);
    console.log(
      `\nYour example site will be available at http://example.localhost:3000`
    );
  } catch (err) {
    error(
      `Failed to initialize project: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
  process.exit(0);
}

/**
 * Register the init command
 */
export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new DialUpDeploy project")
    .argument("[directory]", "Directory to initialize the project in", ".")
    .option(
      "-f, --force",
      "Force initialization even if directory is not empty"
    )
    .action(initProject);
}
