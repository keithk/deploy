import {
  defineScheduledAction,
  executeCommand,
  buildSite
} from "@keithk/deploy-actions";

export default defineScheduledAction({
  id: "scheduled-action",
  schedule: "0 * * * *",
  async handler(payload, context) {
    console.log("Scheduled action triggered with payload:", payload);

    return {
      success: true
    };
  }
});
