/**
 * Simple request logger middleware for Bun.serve.
 * Logs method, path, and response status.
 */

import { debug, info } from "../utils/logging";

export const logger = {
  /**
   * Logs the start of a request
   * @param request The incoming request
   */
  logRequest: (request: Request): number => {
    const start = Date.now();
    const url = new URL(request.url);
    info(`${request.method} ${url.pathname} -> Processing`);
    return start;
  },

  /**
   * Logs the completion of a request
   * @param request The original request
   * @param response The response
   * @param start The start time from logRequest
   */
  logResponse: (request: Request, response: Response, start: number): void => {
    const ms = Date.now() - start;
    const url = new URL(request.url);
    info(`${request.method} ${url.pathname} -> ${response.status} (${ms}ms)`);
  }
};
