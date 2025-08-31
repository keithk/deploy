# 🪝 Lifecycle Hook Actions

Execute code at specific points in the server lifecycle.

## Basic Configuration

```typescript
// sites/mysite/.dialup/actions/startup.ts
import { defineHookAction } from "@@keithk/deploy";

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

## Available Hooks

| Hook                  | Description                    | Payload                                                      |
| --------------------- | ------------------------------ | ------------------------------------------------------------ |
| `server:before-start` | Before the server starts       | `{ server: Server }`                                         |
| `server:after-start`  | After the server has started   | `{ server: Server, port: number }`                           |
| `server:before-stop`  | Before the server shuts down   | `{ server: Server }`                                         |
| `site:before-build`   | Before a site is built         | `{ site: SiteConfig }`                                       |
| `site:after-build`    | After a site has been built    | `{ site: SiteConfig, success: boolean }`                     |
| `route:before-handle` | Before a route is handled      | `{ request: Request, site: SiteConfig }`                     |
| `route:after-handle`  | After a route has been handled | `{ request: Request, response: Response, site: SiteConfig }` |

## Use Cases

Hook actions are useful for a variety of scenarios:

1. **Server Startup/Shutdown**: Initialize resources when the server starts and clean up when it stops
2. **Build Hooks**: Perform actions before or after a site is built
3. **Request Logging**: Log all incoming requests and responses
4. **Performance Monitoring**: Track request durations and performance metrics
5. **Error Tracking**: Capture and report errors during request handling

## Example: Server Startup/Shutdown

```typescript
// sites/mysite/.dialup/actions/server-lifecycle.ts
import { defineHookAction } from "@@keithk/deploy";
import { connect, disconnect } from "./database";

export default defineHookAction({
  id: "server-lifecycle",
  hooks: ["server:after-start", "server:before-stop"],
  async handler(payload, context) {
    // Check which hook is being triggered
    const hook = payload.hook;

    if (hook === "server:after-start") {
      // Server is starting up
      console.log("Server started on port:", payload.port);

      // Initialize database connection
      await connect();

      return {
        success: true,
        message: "Database connected"
      };
    } else if (hook === "server:before-stop") {
      // Server is shutting down
      console.log("Server is shutting down");

      // Close database connection
      await disconnect();

      return {
        success: true,
        message: "Database disconnected"
      };
    }

    return {
      success: false,
      message: "Unknown hook"
    };
  }
});
```

## Example: Request Logging

```typescript
// sites/mysite/.dialup/actions/request-logger.ts
import { defineHookAction } from "@@keithk/deploy";
import { appendFile } from "fs/promises";
import { join } from "path";

export default defineHookAction({
  id: "request-logger",
  hooks: ["route:before-handle", "route:after-handle"],
  async handler(payload, context) {
    const hook = payload.hook;
    const sitePath = context.site?.path || "";
    const logPath = join(sitePath, "logs", "requests.log");

    if (hook === "route:before-handle") {
      // Log the incoming request
      const { request } = payload;
      const timestamp = new Date().toISOString();
      const method = request.method;
      const url = request.url;

      const logEntry = `[${timestamp}] ${method} ${url} - Request received\n`;

      await appendFile(logPath, logEntry, "utf-8");

      return {
        success: true,
        message: "Request logged",
        data: { timestamp, method, url }
      };
    } else if (hook === "route:after-handle") {
      // Log the response
      const { request, response } = payload;
      const timestamp = new Date().toISOString();
      const method = request.method;
      const url = request.url;
      const status = response.status;

      const logEntry = `[${timestamp}] ${method} ${url} - Response sent (${status})\n`;

      await appendFile(logPath, logEntry, "utf-8");

      return {
        success: true,
        message: "Response logged",
        data: { timestamp, method, url, status }
      };
    }

    return {
      success: false,
      message: "Unknown hook"
    };
  }
});
```

## Example: Build Hooks

```typescript
// sites/mysite/.dialup/actions/build-notifications.ts
import { defineHookAction } from "@@keithk/deploy";

export default defineHookAction({
  id: "build-notifications",
  hooks: ["site:before-build", "site:after-build"],
  async handler(payload, context) {
    const hook = payload.hook;
    const siteName = payload.site?.name || "unknown";

    if (hook === "site:before-build") {
      // Site is about to be built
      console.log(`Starting build for site: ${siteName}`);

      // Send notification that build is starting
      await sendNotification(`Build started for ${siteName}`);

      return {
        success: true,
        message: "Build start notification sent"
      };
    } else if (hook === "site:after-build") {
      // Site has been built
      const buildSuccess = payload.success;

      if (buildSuccess) {
        console.log(`Build completed successfully for site: ${siteName}`);
        await sendNotification(`Build completed successfully for ${siteName}`);
      } else {
        console.error(`Build failed for site: ${siteName}`);
        await sendNotification(`Build failed for ${siteName}`, "error");
      }

      return {
        success: true,
        message: "Build completion notification sent",
        data: { buildSuccess }
      };
    }

    return {
      success: false,
      message: "Unknown hook"
    };
  }
});

// Example notification function
async function sendNotification(message, type = "info") {
  // This could send an email, Slack message, etc.
  console.log(`[NOTIFICATION - ${type}] ${message}`);
}
```

## Best Practices

1. **Check Hook Type**: Always check which hook is being triggered in your handler
2. **Error Handling**: Implement proper error handling to avoid crashing the server
3. **Performance**: Keep hook handlers lightweight, especially for request hooks
4. **Async Operations**: Use async/await for asynchronous operations
5. **Logging**: Include appropriate logging for debugging and monitoring

## Related Documentation

- [Environment Variables & Context](../index.md#🔑-environment-variables--context)
- [Action File Location](../index.md#📂-action-file-location)
