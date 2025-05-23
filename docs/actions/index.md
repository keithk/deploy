# Actions & Automation

Automate your sites with powerful actions that can run on schedules, respond to webhooks, expose custom routes, and hook into server lifecycle events.

---

## 🔑 Environment Variables & Context

Actions have access to site-specific environment variables and context information that help them perform their tasks effectively.

### Environment Variables

Each action runs with its own isolated environment:

- **Site-specific actions** have access to environment variables from their site's `.env` file only
- **Root-level actions** have access to the root `.env` variables
- Environment variables are accessible via `context.env` in your action handler

Example of using environment variables in an action:

```typescript
// sites/mysite/.dialup/actions/api-key-action.ts
import { defineScheduledAction } from "@keithk/deploy-actions";

export default defineScheduledAction({
  id: "api-key-action",
  schedule: "0 * * * *", // Run hourly
  async handler(payload, context) {
    // Access environment variables from the site's .env file
    const apiKey = context.env?.API_KEY;

    if (!apiKey) {
      return {
        success: false,
        message: "API_KEY environment variable is not set in site's .env file"
      };
    }

    // Use the API key to make requests
    // ...

    return {
      success: true,
      message: "Action completed successfully"
    };
  }
});
```

### Action Context

The `context` parameter passed to action handlers contains:

| Property  | Type                     | Description                                        |
| --------- | ------------------------ | -------------------------------------------------- |
| `rootDir` | `string`                 | The root directory of the project                  |
| `mode`    | `"serve" \| "dev"`       | The current server mode                            |
| `sites`   | `SiteConfig[]`           | Array of all site configurations                   |
| `config`  | `Record<string, any>`    | Action-specific configuration                      |
| `site`    | `SiteConfig`             | The site configuration (for site-specific actions) |
| `env`     | `Record<string, string>` | Environment variables from the site's `.env` file  |
| `request` | `Request`                | The HTTP request (for route actions)               |

---

## 🚀 Action Types

Deploy supports several types of actions:

1. **[Scheduled Actions](./types/scheduled-actions.md)**: Run on a cron schedule
2. **[Webhook Actions](./types/webhook-actions.md)**: Respond to external webhook events
3. **[Route Actions](./types/route-actions.md)**: Expose custom HTTP endpoints
4. **[Hook Actions](./types/hook-actions.md)**: Execute at specific points in the server lifecycle
5. **[Custom Actions](./types/custom-actions.md)**: Combine any of the above capabilities

Actions can be defined at the site level or at the system level.

---

## 📂 Action File Location

Actions are TypeScript files that are automatically discovered and loaded by the system:

- **Site-specific actions**: Located in the site's `.dialup/actions` directory
  - Example: `sites/mysite/.dialup/actions/nightly-build.ts`
  - Legacy location (still supported): `sites/mysite/actions/nightly-build.ts`
- **Root-level actions**: Located in the root `.dialup/actions` directory
  - Example: `.dialup/actions/system-backup.ts`

The system will first look for actions in the `.dialup/actions` directory, and then fall back to the legacy `actions` directory if needed.

---

## 🛠️ Running Commands in Actions

Actions can execute CLI commands using the `executeCommand` utility. This is useful for running build commands, scripts, or any other CLI operations.

### Basic Command Execution

```typescript
// sites/mysite/.dialup/actions/build-action.ts
import { defineScheduledAction } from "@keithk/deploy-actions";

export default defineScheduledAction({
  id: "build-action",
  schedule: "0 3 * * *", // Run at 3 AM UTC
  async handler(payload, context) {
    // Import the executeCommand utility
    const { executeCommand } = await import("@keithk/deploy-server");

    // Execute a command
    const result = await executeCommand("bun run build", {
      cwd: context.site?.path || ""
    });

    return {
      success: result.success,
      message: result.message,
      data: result.data
    };
  }
});
```

### Command Execution with Environment Variables

```typescript
// sites/mysite/.dialup/actions/deploy-action.ts
import { defineScheduledAction } from "@keithk/deploy-actions";

export default defineScheduledAction({
  id: "deploy-action",
  schedule: "0 4 * * *", // Run at 4 AM UTC
  async handler(payload, context) {
    // Import the executeCommand utility
    const { executeCommand } = await import("@keithk/deploy-server");

    // Get environment variables from context
    const env = context.env || {};

    // Execute a command with environment variables
    const result = await executeCommand("bun run deploy", {
      cwd: context.site?.path || "",
      env: {
        ...env,
        DEPLOY_ACTION: "true"
      }
    });

    return {
      success: result.success,
      message: result.message,
      data: result.data
    };
  }
});
```

### Chaining Multiple Commands

```typescript
// sites/mysite/.dialup/actions/build-and-deploy.ts
import { defineScheduledAction } from "@keithk/deploy-actions";

export default defineScheduledAction({
  id: "build-and-deploy",
  schedule: "0 5 * * *", // Run at 5 AM UTC
  async handler(payload, context) {
    // Import the executeCommand utility
    const { executeCommand } = await import("@keithk/deploy-server");

    // Execute build command
    const buildResult = await executeCommand("bun run build", {
      cwd: context.site?.path || ""
    });

    if (!buildResult.success) {
      return {
        success: false,
        message: `Build failed: ${buildResult.message}`,
        data: buildResult.data
      };
    }

    // Execute deploy command if build was successful
    const deployResult = await executeCommand("bun run deploy", {
      cwd: context.site?.path || ""
    });

    return {
      success: deployResult.success,
      message: `Build: ${buildResult.message}, Deploy: ${deployResult.message}`,
      data: {
        build: buildResult.data,
        deploy: deployResult.data
      }
    };
  }
});
```

---

## 📦 Available Packages & Utilities

Actions have access to several built-in packages and utilities to help with common tasks.

### Core Packages

These packages are available to all actions:

| Package                  | Description              | Import Example                                                    |
| ------------------------ | ------------------------ | ----------------------------------------------------------------- |
| `@keithk/deploy-core`    | Core types and utilities | `import { SiteConfig } from "@keithk/deploy-core";`               |
| `@keithk/deploy-actions` | Action definitions       | `import { defineScheduledAction } from "@keithk/deploy-actions";` |
| `@keithk/deploy-server`  | Server utilities         | `import { executeCommand } from "@keithk/deploy-server";`         |

### Utility Functions

These utility functions are available from the server package:

| Function         | Description                | Example                                                                    |
| ---------------- | -------------------------- | -------------------------------------------------------------------------- |
| `executeCommand` | Execute a CLI command      | `const result = await executeCommand("npm run build", { cwd: sitePath });` |
| `restartSite`    | Restart a site's processes | `const result = await restartSite(siteName);`                              |

### HTTP Requests

For making HTTP requests, you can use the built-in `fetch` API:

```typescript
// Example: Make a GET request
const response = await fetch("https://api.example.com/data");
const data = await response.json();

// Example: Make a POST request
const response = await fetch("https://api.example.com/data", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ key: "value" })
});
```

### Best Practices

1. **Environment Variables**: Always use `context.env` to access environment variables
2. **Error Handling**: Use try/catch blocks to handle errors gracefully
3. **Logging**: Use console.log/warn/error for logging (these are captured in the action logs)
4. **File Paths**: Use `path.join()` to create file paths to ensure cross-platform compatibility
5. **Async/Await**: Use async/await for asynchronous operations
