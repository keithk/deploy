import { resolve, dirname, join } from "path";
import { existsSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { builtInSitesRegistry } from "../core";
import type { SiteConfig } from "../core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Register the built-in editor site
 */
export async function registerEditorSite(): Promise<void> {
  // Path resolution for both dev and production contexts
  // In both cases, we're already in the editor directory
  const finalEditorPath = resolve(__dirname);

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
      // In production, use the compiled JS file
      const isDev = process.env.NODE_ENV === 'development' || !existsSync(join(finalEditorPath, 'index.js'));
      const editorIndexPath = join(finalEditorPath, isDev ? 'index.ts' : 'index.js');
      const fileUrl = pathToFileURL(editorIndexPath).href;
      return import(fileUrl);
    }
  };

  builtInSitesRegistry.register(editorSite);
  console.log('Registered built-in editor site at editor.{domain}');
}