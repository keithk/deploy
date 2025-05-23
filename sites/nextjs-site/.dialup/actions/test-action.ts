import { defineScheduledAction } from "@dialup-deploy/core";

export default defineScheduledAction({
  id: "test-action",
  schedule: "0 0 * * *",
  async handler(payload, context) {
    // Execute the command
    const { executeCommand } = await import("@dialup-deploy/server");
    const result = await executeCommand("echo 'Test action executed'", {
      cwd: context.site?.path || ""
    });

    
    // Trigger build if specified
    if (result.success) {
      const { buildSite } = await import("@dialup-deploy/server");
      const buildResult = await buildSite(context.site!, context);
      
      return {
        success: buildResult.success && result.success,
        message: `Command: ${result.message}, Build: ${buildResult.message}`,
        data: result.data
      };
    }

    return {
      success: result.success,
      message: result.message,
      data: result.data
    };
  }
});
