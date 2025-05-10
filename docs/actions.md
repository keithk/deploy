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
import { defineScheduledAction } from "@dialup-deploy/actions";

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

DialUpDeploy supports several types of actions:

1. **Scheduled Actions**: Run on a cron schedule
2. **Webhook Actions**: Respond to external webhook events
3. **Route Actions**: Expose custom HTTP endpoints
4. **Hook Actions**: Execute at specific points in the server lifecycle
5. **Custom Actions**: Combine any of the above capabilities

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

## ⏱️ Scheduled Actions

Run code on a schedule (nightly builds, content sync, etc.).

### TypeScript Configuration

Create a file in your site's `.dialup/actions` directory:

```typescript
// sites/mysite/.dialup/actions/nightly-build.ts
import { defineScheduledAction, executeCommand } from "@dialup-deploy/actions";

export default defineScheduledAction({
  id: "nightly-build",
  schedule: "0 3 * * *", // Run at 3 AM UTC
  async handler(payload, context) {
    // Run your code here
    // For example, execute a build command:
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

---

## 🔔 Webhook Actions

Respond to external webhook events (GitHub, Stripe, etc.).

### GitHub Integration

The system comes with a built-in GitHub webhook handler. Add this to your root `config.json`:

```json
{
  "github": {
    "repository": "username/repo-name",
    "branch": "main",
    "secret": "your-webhook-secret"
  }
}
```

### Custom Webhook

Create a custom webhook handler:

```typescript
// sites/mysite/.dialup/actions/stripe-webhook.ts
import { defineWebhookAction } from "@dialup-deploy/actions";

export default defineWebhookAction({
  id: "stripe-webhook",
  path: "/webhook/stripe",
  async handler(payload, context) {
    // Process the Stripe webhook event
    const event = payload.body;

    // Do something with the event
    console.log(`Received Stripe event: ${event.type}`);

    return {
      success: true,
      message: "Webhook processed successfully",
      data: { eventType: event.type }
    };
  }
});
```

---

## 🌐 Route Actions

Expose custom HTTP endpoints for your site.

```typescript
// sites/mysite/.dialup/actions/api-routes.ts
import { defineRouteAction } from "@dialup-deploy/actions";

export default defineRouteAction({
  id: "api-routes",
  routes: [
    {
      path: "/api/hello",
      method: "GET",
      handler: async (request, context) => {
        return new Response(JSON.stringify({ message: "Hello, world!" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    },
    {
      path: "/api/data",
      method: "POST",
      handler: async (request, context) => {
        const data = await request.json();
        // Process the data
        return new Response(JSON.stringify({ success: true, data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  ]
});
```

---

## 🪝 Lifecycle Hook Actions

Execute code at specific points in the server lifecycle.

```typescript
// sites/mysite/.dialup/actions/startup.ts
import { defineHookAction } from "@dialup-deploy/actions";

export default defineHookAction({
  id: "startup",
  hooks: ["server:after-start"],
  async handler(payload, context) {
    console.log("Server has started!");

    // Initialize resources, connect to databases, etc.

    return {
      success: true,
      message: "Startup tasks completed"
    };
  }
});
```

Available hooks:

- `server:before-start`: Before the server starts
- `server:after-start`: After the server has started
- `server:before-stop`: Before the server shuts down
- `site:before-build`: Before a site is built
- `site:after-build`: After a site has been built
- `route:before-handle`: Before a route is handled
- `route:after-handle`: After a route has been handled

---

## 🧩 Custom Actions

Combine multiple capabilities in a single action:

```typescript
// sites/mysite/.dialup/actions/multi-purpose.ts
import { defineAction } from "@dialup-deploy/core";

export default defineAction({
  id: "multi-purpose",
  type: "custom",
  // Run on server start
  hooks: ["server:after-start"],
  // Expose a route
  routes: [
    {
      path: "/api/status",
      method: "GET",
      handler: async (req, context) => {
        return new Response(JSON.stringify({ status: "online" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  ],
  // Config with schedule
  config: {
    schedule: "*/30 * * * *" // Run every 30 minutes
  },
  // Main handler
  async handler(payload, context) {
    console.log("Action executed!");

    return {
      success: true,
      message: "Action completed"
    };
  }
});
```

---

## 📝 Example: Full Site Config with Actions

### TypeScript Configuration

```
sites/mysite/
├── config.json
├── package.json
├── src/
└── .dialup/
    ├── config.json
    └── actions/
        ├── nightly-build.ts
        ├── api-routes.ts
        └── startup.ts
```

Actions are automatically discovered and registered when the server starts.

---

## 🛠️ Running Commands in Actions

Actions can execute CLI commands using the `executeCommand` utility. This is useful for running build commands, scripts, or any other CLI operations.

### Basic Command Execution

```typescript
// sites/mysite/.dialup/actions/build-action.ts
import { defineScheduledAction } from "@dialup-deploy/core";

export default defineScheduledAction({
  id: "build-action",
  schedule: "0 3 * * *", // Run at 3 AM UTC
  async handler(payload, context) {
    // Import the executeCommand utility
    const { executeCommand } = await import("@dialup-deploy/server");

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
import { defineScheduledAction } from "@dialup-deploy/core";

export default defineScheduledAction({
  id: "deploy-action",
  schedule: "0 4 * * *", // Run at 4 AM UTC
  async handler(payload, context) {
    // Import the executeCommand utility
    const { executeCommand } = await import("@dialup-deploy/server");

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
import { defineScheduledAction } from "@dialup-deploy/core";

export default defineScheduledAction({
  id: "build-and-deploy",
  schedule: "0 5 * * *", // Run at 5 AM UTC
  async handler(payload, context) {
    // Import the executeCommand utility
    const { executeCommand } = await import("@dialup-deploy/server");

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

## � Action-Based Sites

You can create sites that are primarily or entirely driven by actions. This approach is useful for:

- **API-only sites**: Create a site that only exposes API endpoints
- **Scheduled tasks**: Run periodic jobs without a frontend
- **Integration hubs**: Connect different services and systems
- **Data processing pipelines**: Process and transform data on a schedule

### Example: API-Only Site

```typescript
// sites/api-site/.dialup/actions/api-endpoints.ts
import { defineRouteAction } from "@dialup-deploy/core";

export default defineRouteAction({
  id: "api-endpoints",
  routes: [
    {
      path: "/api/users",
      method: "GET",
      handler: async (request, context) => {
        // Fetch users from a database
        const users = [
          /* ... */
        ];

        return new Response(JSON.stringify({ users }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    },
    {
      path: "/api/users",
      method: "POST",
      handler: async (request, context) => {
        // Create a new user
        const data = await request.json();

        // Save to database
        // ...

        return new Response(JSON.stringify({ success: true }), {
          status: 201,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  ]
});
```

### Example: Data Processing Site

```typescript
// sites/data-processor/.dialup/actions/process-data.ts
import { defineScheduledAction } from "@dialup-deploy/core";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

export default defineScheduledAction({
  id: "process-data",
  schedule: "*/30 * * * *", // Run every 30 minutes
  async handler(payload, context) {
    const sitePath = context.site?.path || "";

    // Read input data
    const inputPath = join(sitePath, "data/input.json");
    const inputData = JSON.parse(await readFile(inputPath, "utf-8"));

    // Process data
    const processedData = inputData.map((item) => ({
      ...item,
      processed: true,
      timestamp: new Date().toISOString()
    }));

    // Write output data
    const outputPath = join(sitePath, "data/output.json");
    await writeFile(
      outputPath,
      JSON.stringify(processedData, null, 2),
      "utf-8"
    );

    return {
      success: true,
      message: `Processed ${inputData.length} items`,
      data: {
        itemCount: inputData.length
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

| Package                 | Description              | Import Example                                                 |
| ----------------------- | ------------------------ | -------------------------------------------------------------- |
| `@dialup-deploy/core`   | Core types and utilities | `import { defineScheduledAction } from "@dialup-deploy/core";` |
| `@dialup-deploy/server` | Server utilities         | `import { executeCommand } from "@dialup-deploy/server";`      |

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
