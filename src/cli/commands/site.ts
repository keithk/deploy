
import { Command } from "commander";
import { join, resolve } from "path";
import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import chalk from "chalk";
import { debug, info, error } from "../../core";

/**
 * Initializes a new site with the specified type and configuration
 * @param name Site identifier used for directory and subdomain
 * @param options Site type and creation options
 */
async function createSite(
  name: string,
  options: { type?: string; force?: boolean } = {}
): Promise<void> {
  try {
    const siteType = options.type || "static";
    const validTypes = ["static", "static-build", "dynamic", "passthrough"];

    if (!validTypes.includes(siteType)) {
      error(`Invalid site type: ${siteType}`);
      console.log(`Valid types are: ${validTypes.join(", ")}`);
      return;
    }

    const rootDir = process.env.ROOT_DIR
      ? resolve(process.env.ROOT_DIR, "..")
      : resolve(process.cwd());

    const sitesDir = join(rootDir, "sites");
    const examplesDir = join(rootDir, "examples");
    
    if (!existsSync(sitesDir)) {
      console.log(`Creating sites directory: ${sitesDir}`);
      mkdirSync(sitesDir, { recursive: true });
    }
    
    if (!existsSync(examplesDir)) {
      console.log(`Creating examples directory: ${examplesDir}`);
      mkdirSync(examplesDir, { recursive: true });
    }

    const siteDir = join(sitesDir, name);
    if (existsSync(siteDir) && !options.force) {
      error(`Site ${name} already exists. Use --force to overwrite.`);
      return;
    }

    console.log(`Creating site: ${name} (${siteType})`);
    mkdirSync(siteDir, { recursive: true });

    const deployDir = join(siteDir, ".deploy");
    mkdirSync(deployDir, { recursive: true });

    // Setup actions directory for site-specific automation
    const actionsDir = join(deployDir, "actions");
    mkdirSync(actionsDir, { recursive: true });

    // Configure site with type-specific defaults
    const configPath = join(deployDir, "config.json");
    const config = {
      type: siteType,
      subdomain: name
    };

    await Bun.write(configPath, JSON.stringify(config, null, 2));

    // Create site files based on type
    switch (siteType) {
      case "static":
        await createStaticSite(siteDir);
        break;
      case "static-build":
        await createStaticBuildSite(siteDir, name);
        break;
      case "dynamic":
        await createDynamicSite(siteDir, name);
        break;
      case "passthrough":
        await createPassthroughSite(siteDir, name);
        break;
    }

    console.log(chalk.green(`Site ${name} created successfully!`));
    console.log(`\nYour site will be available at:`);
    console.log(`- Local: http://${name}.localhost:3000`);
    console.log(`- Production: https://${name}.<your-domain>`);

    console.log(`\nNext steps:`);
    console.log(`1. Customize your site in sites/${name}/`);
    console.log(`2. Run 'deploy start' to start the server`);
  } catch (err) {
    error(
      `Failed to create site: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  process.exit(0);
}

/**
 * Generates starter files for a basic static HTML site
 * @param siteDir Target directory for site files
 */
async function createStaticSite(siteDir: string): Promise<void> {
  const indexPath = join(siteDir, "index.html");
  const indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Static Site</title>
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
  </style>
</head>
<body>
  <h1>Static Site</h1>
  
  <div class="card">
    <h2>Your static site is ready!</h2>
    <p>This is a simple static site. You can add more HTML, CSS, and JavaScript files to this directory.</p>
  </div>
</body>
</html>`;

  await Bun.write(indexPath, indexContent);

  const cssPath = join(siteDir, "styles.css");
  const cssContent = `/* Add your styles here */
`;

  await Bun.write(cssPath, cssContent);
}

/**
 * Create a static-build site
 * @param siteDir The site directory
 * @param name The site name
 */
async function createStaticBuildSite(
  siteDir: string,
  name: string
): Promise<void> {
  const packagePath = join(siteDir, "package.json");
  const packageContent = {
    name: `${name}-site`,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview"
    },
    dependencies: {
      vite: "^5.0.0"
    }
  };

  await Bun.write(packagePath, JSON.stringify(packageContent, null, 2));

  const indexPath = join(siteDir, "index.html");
  const indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Static Build Site</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <h1>Static Build Site</h1>
  
  <div class="card">
    <h2>Your static-build site is ready!</h2>
    <p>This is a site that will be built before deployment. You can customize it and run 'npm run build' to build it.</p>
  </div>
  
  <script type="module" src="./main.js"></script>
</body>
</html>`;

  await Bun.write(indexPath, indexContent);

  const cssPath = join(siteDir, "styles.css");
  const cssContent = `body {
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
`;

  await Bun.write(cssPath, cssContent);

  const jsPath = join(siteDir, "main.js");
  const jsContent = `// Add your JavaScript here
console.log('Static build site loaded!');
`;

  await Bun.write(jsPath, jsContent);

  const gitignorePath = join(siteDir, ".gitignore");
  const gitignoreContent = `node_modules
dist
.DS_Store
`;

  await Bun.write(gitignorePath, gitignoreContent);
}

/**
 * Create a dynamic site
 * @param siteDir The site directory
 * @param name The site name
 */
async function createDynamicSite(siteDir: string, name: string): Promise<void> {
  const indexPath = join(siteDir, "index.ts");
  const indexContent = `// Dynamic site entry point

export default {
  async fetch(request: Request) {
    return new Response(\`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dynamic Site</title>
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
        </style>
      </head>
      <body>
        <h1>Dynamic Site</h1>
        
        <div class="card">
          <h2>Your dynamic site is ready!</h2>
          <p>This is a dynamic site powered by Bun. You can customize the response in the index.ts file.</p>
          <p>Request URL: \${request.url}</p>
          <p>Request method: \${request.method}</p>
          <p>Current time: \${new Date().toLocaleString()}</p>
        </div>
      </body>
      </html>
    \`, {
      headers: {
        "Content-Type": "text/html"
      }
    });
  }
};
`;

  await Bun.write(indexPath, indexContent);
}

/**
 * Create a passthrough site
 * @param siteDir The site directory
 * @param name The site name
 */
async function createPassthroughSite(
  siteDir: string,
  name: string
): Promise<void> {
  const packagePath = join(siteDir, "package.json");
  const packageContent = {
    name: `${name}-site`,
    version: "0.1.0",
    private: true,
    scripts: {
      start: "bun run server.ts"
    },
    dependencies: {
      express: "^4.18.2"
    },
    devDependencies: {
      "@types/express": "^4.17.21",
      "bun-types": "latest"
    }
  };

  await Bun.write(packagePath, JSON.stringify(packageContent, null, 2));

  // Create server.ts
  const serverPath = join(siteDir, "server.ts");
  const serverContent = `// Passthrough site server
import express from 'express';

const app = express();
const port = process.env.PORT || 3001;

app.get('/', (req, res) => {
  res.send(\`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Passthrough Site</title>
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
      </style>
    </head>
    <body>
      <h1>Passthrough Site</h1>
      
      <div class="card">
        <h2>Your passthrough site is ready!</h2>
        <p>This is a passthrough site powered by Express. You can customize the server in the server.ts file.</p>
        <p>Current time: \${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  \`);
});

app.listen(port, () => {
  console.log(\`Server running at http://localhost:\${port}\`);
});
`;

  await Bun.write(serverPath, serverContent);

  const gitignorePath = join(siteDir, ".gitignore");
  const gitignoreContent = `node_modules
.DS_Store
`;

  await Bun.write(gitignorePath, gitignoreContent);
}

/**
 * List all sites in the project
 */
async function listSites(options: { detailed?: boolean; json?: boolean } = {}): Promise<void> {
  try {
    if (options.detailed) {
      // Use the detailed formatting from site-manager
      const { listSitesFormatted } = await import("../utils/site-manager");
      
      if (options.json) {
        const { getSites } = await import("../utils/site-manager");
        const sites = await getSites();
        console.log(JSON.stringify(sites, null, 2));
      } else {
        console.log(chalk.bold("\nAvailable sites:"));
        console.log("─".repeat(50));
        
        const sitesOutput = await listSitesFormatted();
        console.log(sitesOutput);
      }
      
      process.exit(0);
    }

    // Simple list format (default)
    // Determine the project root directory
    const rootDir = process.env.ROOT_DIR
      ? resolve(process.env.ROOT_DIR, "..")
      : resolve(process.cwd());

    // Check if the sites and examples directories exist
    const sitesDir = join(rootDir, "sites");
    const examplesDir = join(rootDir, "examples");
    
    if (!existsSync(sitesDir) && !existsSync(examplesDir)) {
      console.log(chalk.yellow("No sites or examples directories found"));
      console.log(chalk.dim(`Expected locations: ${sitesDir}, ${examplesDir}`));
      console.log(chalk.dim("Run 'deploy site create <name>' to create your first site"));
      process.exit(0);
    }

    // Get all directories in the sites and examples directories
    const sites = existsSync(sitesDir) ? readdirSync(sitesDir) : [];
    const examples = existsSync(examplesDir) ? readdirSync(examplesDir) : [];

    if (sites.length === 0 && examples.length === 0) {
      console.log(chalk.yellow("No sites or examples found"));
      console.log(chalk.dim("Run 'deploy site create <name>' to create your first site"));
      process.exit(0);
    }

    const siteList: Array<{ name: string; type: string; category: string }> = [];

    const processDir = async (baseDir: string, category: string) => {
      for (const site of readdirSync(baseDir)) {
        const siteDir = join(baseDir, site);

        // Skip if not a directory
        try {
          const stats = statSync(siteDir);
          if (!stats.isDirectory()) {
            continue;
          }
        } catch (err) {
          continue;
        }

        // Try to get the site type from the config
        let siteType = "unknown";

        // First check .deploy/config.json
        const preferredConfigPath = join(siteDir, ".deploy", "config.json");
        if (existsSync(preferredConfigPath)) {
          try {
            const configContent = await Bun.file(preferredConfigPath).text();
            const config = JSON.parse(configContent);
            siteType = config.type || "unknown";
          } catch (err) {
            // Ignore errors
          }
        } else {
          // Fall back to deploy.json
          const fallbackConfigPath = join(siteDir, "deploy.json");
          if (existsSync(fallbackConfigPath)) {
            try {
              const configContent = await Bun.file(fallbackConfigPath).text();
              const config = JSON.parse(configContent);
              siteType = config.type || "unknown";
            } catch (err) {
              // Ignore errors
            }
          }
        }

        siteList.push({ 
          name: site, 
          type: siteType,
          category: category
        });
      }
    };

    // Process both sites and examples directories
    if (existsSync(sitesDir)) {
      await processDir(sitesDir, "site");
    }
    if (existsSync(examplesDir)) {
      await processDir(examplesDir, "example");
    }

    if (options.json) {
      console.log(JSON.stringify(siteList, null, 2));
    } else {
      console.log(chalk.bold(`\n📁 Sites (${siteList.length}):`));
      console.log("─".repeat(30));

      const typeColors = {
        static: chalk.blue,
        dynamic: chalk.green,
        passthrough: chalk.yellow,
        "static-build": chalk.cyan,
        unknown: chalk.gray
      };

      const categoryColors = {
        site: chalk.green,
        example: chalk.magenta
      };

      siteList.forEach(({ name, type, category }) => {
        const typeColorFn = typeColors[type as keyof typeof typeColors] || chalk.white;
        const categoryColorFn = categoryColors[category as keyof typeof categoryColors] || chalk.white;
        console.log(`${chalk.bold(name)} ${chalk.dim("→")} ${typeColorFn(type)} ${chalk.dim("[")}${categoryColorFn(category)}${chalk.dim("]")}`);
      });

      console.log(chalk.dim(`\nCommands:`));
      console.log(chalk.dim(`  deploy site list --detailed  # Show commands and build info`));
      console.log(chalk.dim(`  deploy site create <name>    # Create a new site`));
    }
    
  } catch (err) {
    error(
      `Failed to list sites: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    process.exit(1);
  }

  process.exit(0);
}

/**
 * Register the site commands
 */
export function registerSiteCommands(program: Command): void {
  const siteCommand = program.command("site").description("Manage sites");

  siteCommand
    .command("create")
    .description("Create a new site")
    .argument("<name>", "Name of the site")
    .option(
      "-t, --type <type>",
      "Type of site (static, static-build, dynamic, passthrough)",
      "static"
    )
    .option("-f, --force", "Force creation even if site already exists")
    .action(createSite);

  siteCommand
    .command("list")
    .description("List all sites")
    .option("--detailed", "Show detailed information including commands", false)
    .option("--json", "Output as JSON", false)
    .action(listSites);
}
