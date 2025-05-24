import {
  defineScheduledAction,
  executeCommand,
  buildSite
} from "@keithk/deploy-actions";

export default defineScheduledAction({
  id: "scheduled-action",
  schedule: "0 * * * *",
  async handler(payload, context) {
    // Execute the command
    const result = await executeCommand("echo 'No command specified'", {
      cwd: context.site?.path || ""
    });

    // Trigger build if specified
    if (result.success) {
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
