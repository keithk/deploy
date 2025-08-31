import { Command } from "commander";
import { info, error } from "../../core";

/**
 * Enable the editor site
 */
function enableEditor(): void {
  try {
    // Check if editor is already enabled by checking environment or config
    if (process.env.EDITOR_DISABLED === 'true') {
      delete process.env.EDITOR_DISABLED;
      info("✅ Editor site enabled");
      info("💡 Restart your server with 'deploy dev' or 'deploy start' to apply changes");
    } else {
      info("✅ Editor site is already enabled");
    }
    
    info("🌐 Editor will be available at: https://editor.{your-domain}");
  } catch (err) {
    error(`Failed to enable editor: ${
      err instanceof Error ? err.message : String(err)
    }`);
  }
}

/**
 * Disable the editor site
 */
function disableEditor(): void {
  try {
    process.env.EDITOR_DISABLED = 'true';
    info("✅ Editor site disabled");
    info("💡 Restart your server with 'deploy dev' or 'deploy start' to apply changes");
  } catch (err) {
    error(`Failed to disable editor: ${
      err instanceof Error ? err.message : String(err)
    }`);
  }
}

/**
 * Show editor site status
 */
function editorStatus(): void {
  try {
    const isEnabled = process.env.EDITOR_DISABLED !== 'true';
    
    if (isEnabled) {
      info("✅ Editor site is enabled");
      info("🌐 Available at: https://editor.{your-domain}");
    } else {
      info("❌ Editor site is disabled");
    }
    
    info("💡 Use 'deploy editor enable/disable' to change status");
  } catch (err) {
    error(`Failed to check editor status: ${
      err instanceof Error ? err.message : String(err)
    }`);
  }
}

/**
 * Register editor site management commands
 * @param program Commander program
 */
export function registerEditorCommands(program: Command): void {
  const editorCommand = program.command("editor").description("Manage the built-in code editor");

  editorCommand
    .command("enable")
    .description("Enable the built-in code editor")
    .action(enableEditor);

  editorCommand
    .command("disable")
    .description("Disable the built-in code editor")
    .action(disableEditor);

  editorCommand
    .command("status")
    .description("Show code editor status")
    .action(editorStatus);
}