import { resolve, dirname, join } from "path";
import { existsSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { builtInSitesRegistry } from "@keithk/deploy-core";
import type { SiteConfig } from "@keithk/deploy-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Register the built-in editor site
 */
export async function registerEditorSite(): Promise<void> {
  // Path resolution for both dev and production contexts
  const editorPath = resolve(__dirname, '../editor');
  const srcEditorPath = resolve(__dirname, '../src/editor');
  const finalEditorPath = existsSync(join(editorPath, 'site.json')) ? editorPath : srcEditorPath;

  // Check if editor is disabled via environment variable
  const isDisabled = process.env.EDITOR_DISABLED === 'true';
  
  if (isDisabled) {
    console.log('Editor site is disabled via EDITOR_DISABLED environment variable');
    return;
  }

  const editorSite: SiteConfig = {
    name: 'editor',
    type: 'built-in',
    subdomain: 'editor',
    path: finalEditorPath,
    route: '/editor',
    isBuiltIn: true,
    module: () => {
      const editorIndexPath = join(finalEditorPath, 'index.ts');
      const fileUrl = pathToFileURL(editorIndexPath).href;
      return import(fileUrl);
    }
  };

  builtInSitesRegistry.register(editorSite);
  console.log('Registered built-in editor site at editor.{domain}');
}