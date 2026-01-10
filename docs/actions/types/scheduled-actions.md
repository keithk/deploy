# ⏱️ Scheduled Actions

Run code on a schedule (nightly builds, content sync, etc.).

## TypeScript Configuration

Create a file in your site's `.dialup/actions` directory:

```typescript
// sites/mysite/.dialup/actions/nightly-build.ts
import { defineScheduledAction, executeCommand, buildSite } from "@keithk/deploy-actions";

export default defineScheduledAction({
  id: "nightly-build",
  schedule: "0 3 * * *", // Run at 3 AM UTC
  async handler(payload, context) {
    // Run your code here
    // For example, execute a build command:
    const result = await executeCommand("bun run build", {
      cwd: context.site?.path || ""
    });

    // Or trigger a site build for static-build sites:
    // const buildResult = await buildSite(context.site!, context);

    return {
      success: result.success,
      message: result.message,
      data: result.data
    };
  }
});
```

## Cron Schedule Syntax

Scheduled actions use cron syntax to define when they should run:

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of the month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of the week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
│ │ │ │ │
* * * * *
```

### Common Cron Examples

| Cron Expression | Description                               |
| --------------- | ----------------------------------------- |
| `0 * * * *`     | Run at the beginning of every hour        |
| `*/15 * * * *`  | Run every 15 minutes                      |
| `0 0 * * *`     | Run at midnight (00:00) every day         |
| `0 3 * * *`     | Run at 3 AM every day                     |
| `0 0 * * 0`     | Run at midnight on Sunday                 |
| `0 0 1 * *`     | Run at midnight on the first day of month |
| `0 12 * * 1-5`  | Run at noon on Monday through Friday      |

## Best Practices

1. **Unique IDs**: Give each scheduled action a unique ID to avoid conflicts
2. **Error Handling**: Include proper error handling in your action handler
3. **Logging**: Log important events and errors for debugging
4. **Idempotency**: Design actions to be idempotent (safe to run multiple times)
5. **Timeouts**: Be aware of execution timeouts for long-running actions

## Example: Data Backup Action

```typescript
// sites/mysite/.dialup/actions/backup.ts
import { defineScheduledAction } from "@keithk/deploy-actions";
import { join } from "path";
import { writeFile } from "fs/promises";

export default defineScheduledAction({
  id: "data-backup",
  schedule: "0 0 * * *", // Run at midnight every day
  async handler(payload, context) {
    try {
      // Get site path
      const sitePath = context.site?.path || "";

      // Generate backup data
      const data = {
        timestamp: new Date().toISOString()
        // ... your data to backup
      };

      // Create backup filename with timestamp
      const backupPath = join(sitePath, "backups", `backup-${Date.now()}.json`);

      // Write backup file
      await writeFile(backupPath, JSON.stringify(data, null, 2), "utf-8");

      return {
        success: true,
        message: `Backup created at ${backupPath}`,
        data: { path: backupPath }
      };
    } catch (error) {
      console.error("Backup failed:", error);
      return {
        success: false,
        message: `Backup failed: ${error.message}`,
        data: { error: error.message }
      };
    }
  }
});
```

## Related Documentation

- [Running Commands in Actions](../index.md#🛠️-running-commands-in-actions)
- [Environment Variables & Context](../index.md#🔑-environment-variables--context)
