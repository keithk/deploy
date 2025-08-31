import { join } from "path";
import type { SiteConfig } from "../core";

/**
 * Creates a handler for static sites.
 *
 * @param site The site configuration
 * @returns A function that serves static files
 */
export function createStaticSiteHandler(site: SiteConfig) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const filePath = join(site.path, url.pathname);
    const fileObj = Bun.file(filePath);

    if (await fileObj.exists()) {
      return new Response(fileObj);
    } else {
      // Try index.html if the path is a directory
      const indexPath = join(filePath, "index.html");
      const indexFile = Bun.file(indexPath);

      if (await indexFile.exists()) {
        return new Response(indexFile);
      }

      return new Response("File not found", { status: 404 });
    }
  };
}
