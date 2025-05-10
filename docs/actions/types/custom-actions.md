# 🧩 Custom Actions

Combine multiple capabilities in a single action.

## Basic Configuration

```typescript
// sites/mysite/.dialup/actions/multi-purpose.ts
import { defineAction } from "@dialup-deploy/actions";

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

## Combining Multiple Capabilities

Custom actions allow you to combine multiple action types in a single definition:

1. **Scheduled Execution**: Run on a cron schedule
2. **Webhook Handling**: Respond to webhook events
3. **Route Handling**: Expose HTTP endpoints
4. **Lifecycle Hooks**: Execute at specific server lifecycle points

## Configuration Options

| Option    | Type                        | Description                                       |
| --------- | --------------------------- | ------------------------------------------------- |
| `id`      | `string`                    | Unique identifier for the action                  |
| `type`    | `"custom"`                  | Action type (must be "custom" for custom actions) |
| `hooks`   | `string[]`                  | Array of lifecycle hooks to listen for            |
| `routes`  | `RouteConfig[]`             | Array of route configurations                     |
| `config`  | `Record<string, any>`       | Custom configuration options                      |
| `handler` | `(payload, context) => any` | Main handler function for the action              |

## Payload Handling

The payload passed to the handler depends on what triggered the action:

```typescript
async handler(payload, context) {
  // Determine what triggered this action
  if (payload.hook) {
    // This was triggered by a lifecycle hook
    const hook = payload.hook;
    console.log(`Triggered by hook: ${hook}`);

    // Handle different hooks
    if (hook === "server:after-start") {
      // Server started
    } else if (hook === "server:before-stop") {
      // Server stopping
    }
  } else if (payload.schedule) {
    // This was triggered by a schedule
    console.log(`Triggered by schedule: ${payload.schedule}`);

    // Run scheduled tasks
  } else if (payload.webhook) {
    // This was triggered by a webhook
    console.log(`Triggered by webhook: ${payload.webhook.path}`);

    // Process webhook data
    const data = payload.webhook.body;
  }

  return {
    success: true,
    message: "Action handled"
  };
}
```

## Example: Monitoring Action

```typescript
// sites/mysite/.dialup/actions/system-monitor.ts
import { defineAction } from "@dialup-deploy/actions";
import { writeFile } from "fs/promises";
import { join } from "path";
import os from "os";

export default defineAction({
  id: "system-monitor",
  type: "custom",
  // Run on server start and every 5 minutes
  hooks: ["server:after-start"],
  config: {
    schedule: "*/5 * * * *"
  },
  // Expose monitoring endpoints
  routes: [
    {
      path: "/api/monitor/status",
      method: "GET",
      handler: async (req, context) => {
        const stats = await collectSystemStats();

        return new Response(JSON.stringify(stats), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    },
    {
      path: "/api/monitor/history",
      method: "GET",
      handler: async (req, context) => {
        const sitePath = context.site?.path || "";
        const historyPath = join(sitePath, "data", "monitor-history.json");

        try {
          const history = require(historyPath);
          return new Response(JSON.stringify(history), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "History not available" }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" }
            }
          );
        }
      }
    }
  ],
  // Main handler for scheduled and hook-based execution
  async handler(payload, context) {
    console.log("Running system monitor...");

    // Collect system stats
    const stats = await collectSystemStats();

    // Save to history file
    const sitePath = context.site?.path || "";
    const dataDir = join(sitePath, "data");
    const historyPath = join(dataDir, "monitor-history.json");

    // Create data directory if it doesn't exist
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      // Directory already exists or can't be created
    }

    // Read existing history or create new
    let history = [];
    try {
      history = require(historyPath);
    } catch (error) {
      // File doesn't exist yet
    }

    // Add new entry
    history.push({
      timestamp: new Date().toISOString(),
      ...stats
    });

    // Keep only the last 100 entries
    if (history.length > 100) {
      history = history.slice(-100);
    }

    // Write updated history
    await writeFile(historyPath, JSON.stringify(history, null, 2), "utf-8");

    return {
      success: true,
      message: "System stats collected and saved",
      data: stats
    };
  }
});

// Helper function to collect system stats
async function collectSystemStats() {
  return {
    uptime: os.uptime(),
    loadAvg: os.loadavg(),
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    cpus: os.cpus().length,
    platform: os.platform(),
    release: os.release()
  };
}
```

## Example: Content Sync Action

```typescript
// sites/mysite/.dialup/actions/content-sync.ts
import { defineAction } from "@dialup-deploy/actions";
import { writeFile, readFile } from "fs/promises";
import { join } from "path";

export default defineAction({
  id: "content-sync",
  type: "custom",
  // Run every hour and expose webhook for manual trigger
  config: {
    schedule: "0 * * * *",
    contentApi: {
      url: "https://api.example.com/content",
      apiKey: process.env.CONTENT_API_KEY
    }
  },
  // Webhook for manual trigger
  routes: [
    {
      path: "/api/sync/trigger",
      method: "POST",
      handler: async (req, context) => {
        // Validate secret token
        const authHeader = req.headers.get("Authorization");
        const token = authHeader?.split(" ")[1];

        if (token !== context.env?.SYNC_TOKEN) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Trigger sync manually
        const result = await syncContent(context);

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    },
    {
      path: "/api/sync/status",
      method: "GET",
      handler: async (req, context) => {
        const sitePath = context.site?.path || "";
        const statusPath = join(sitePath, "data", "sync-status.json");

        try {
          const status = JSON.parse(await readFile(statusPath, "utf-8"));
          return new Response(JSON.stringify(status), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Status not available" }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" }
            }
          );
        }
      }
    }
  ],
  // Main handler
  async handler(payload, context) {
    // Check if this is a scheduled run
    if (payload.schedule) {
      console.log("Running scheduled content sync");
      return await syncContent(context);
    }

    return {
      success: false,
      message: "No action taken"
    };
  }
});

// Helper function to sync content
async function syncContent(context) {
  const sitePath = context.site?.path || "";
  const dataDir = join(sitePath, "data");
  const contentDir = join(sitePath, "content");
  const statusPath = join(dataDir, "sync-status.json");

  // Create directories if they don't exist
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(contentDir, { recursive: true });

  // Get API configuration
  const apiUrl = context.config?.contentApi?.url;
  const apiKey =
    context.config?.contentApi?.apiKey || context.env?.CONTENT_API_KEY;

  if (!apiUrl || !apiKey) {
    const error = "Content API configuration missing";

    // Update status
    await writeFile(
      statusPath,
      JSON.stringify({
        lastRun: new Date().toISOString(),
        success: false,
        error
      }),
      "utf-8"
    );

    return {
      success: false,
      message: error
    };
  }

  try {
    // Fetch content from API
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(
        `API returned ${response.status}: ${response.statusText}`
      );
    }

    const content = await response.json();

    // Save each content item
    for (const item of content.items) {
      const itemPath = join(contentDir, `${item.id}.json`);
      await writeFile(itemPath, JSON.stringify(item, null, 2), "utf-8");
    }

    // Update status
    const status = {
      lastRun: new Date().toISOString(),
      success: true,
      itemCount: content.items.length
    };

    await writeFile(statusPath, JSON.stringify(status, null, 2), "utf-8");

    return {
      success: true,
      message: `Synced ${content.items.length} content items`,
      data: { itemCount: content.items.length }
    };
  } catch (error) {
    console.error("Content sync failed:", error);

    // Update status
    await writeFile(
      statusPath,
      JSON.stringify({
        lastRun: new Date().toISOString(),
        success: false,
        error: error.message
      }),
      "utf-8"
    );

    return {
      success: false,
      message: `Content sync failed: ${error.message}`,
      data: { error: error.message }
    };
  }
}
```

## Related Documentation

- [Scheduled Actions](./scheduled-actions.md)
- [Webhook Actions](./webhook-actions.md)
- [Route Actions](./route-actions.md)
- [Hook Actions](./hook-actions.md)
- [Environment Variables & Context](../index.md#🔑-environment-variables--context)
