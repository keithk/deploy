// ABOUTME: Proxies HTTP requests and WebSocket connections to local development servers.
// ABOUTME: Handles both regular HTTP proxying and WebSocket upgrade/tunneling.

import { debug, info, warn } from "./logging";
import { processManager } from "./process-manager";
import type { Server, ServerWebSocket } from "bun";

// Type for WebSocket data passed during upgrade
interface WsProxyData {
  targetWs: WebSocket;
  targetPort: number;
  clientWs?: ServerWebSocket<WsProxyData>;
}

/**
 * Checks if a request is a WebSocket upgrade request.
 */
export function isWebSocketUpgrade(request: Request): boolean {
  const upgrade = request.headers.get("Upgrade");
  return upgrade?.toLowerCase() === "websocket";
}

/**
 * Creates WebSocket handlers for the server.
 * This should be passed to Bun.serve websocket option.
 */
export function createWebSocketHandlers() {
  return {
    open(ws: ServerWebSocket<WsProxyData>) {
      debug("WebSocket proxy: client connected");
      const targetWs = ws.data?.targetWs;
      if (targetWs) {
        // Store reference to client ws for message relay
        ws.data.clientWs = ws;
        
        // Set up message relay from target to client
        targetWs.onmessage = (event) => {
          if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(event.data);
          }
        };
        
        targetWs.onclose = () => {
          debug("WebSocket proxy: target closed, closing client");
          ws.close();
        };
        
        targetWs.onerror = (error) => {
          debug("WebSocket proxy: target error");
          ws.close();
        };
      }
    },
    message(ws: ServerWebSocket<WsProxyData>, message: string | Buffer) {
      const targetWs = ws.data?.targetWs;
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(message);
      }
    },
    close(ws: ServerWebSocket<WsProxyData>, code: number, reason: string) {
      debug("WebSocket proxy: client disconnected (" + code + ")");
      const targetWs = ws.data?.targetWs;
      if (targetWs && targetWs.readyState !== WebSocket.CLOSED) {
        targetWs.close(code, reason);
      }
    },
  };
}

/**
 * Upgrades an HTTP request to a WebSocket connection and proxies it to the target.
 * Returns a Response if upgrade fails, undefined on success.
 */
export async function upgradeWebSocket(
  request: Request,
  server: Server<WsProxyData>,
  targetPort: number
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const targetUrl = "ws://localhost:" + targetPort + url.pathname + url.search;

  debug("WebSocket proxy: upgrading connection to " + targetUrl);

  // Create connection to target server first
  const targetWs = new WebSocket(targetUrl);

  // Wait for connection to be established
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 5000);
      targetWs.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };
      targetWs.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket connection failed"));
      };
    });
  } catch (err) {
    debug("WebSocket proxy: failed to connect to target: " + (err instanceof Error ? err.message : String(err)));
    targetWs.close();
    return new Response("WebSocket proxy error: " + (err instanceof Error ? err.message : String(err)), { status: 502 });
  }

  // Upgrade the client connection - the open handler will set up message relay
  const upgraded = server.upgrade(request, {
    data: { targetWs, targetPort } as WsProxyData,
  });

  if (!upgraded) {
    targetWs.close();
    return new Response("WebSocket upgrade failed", { status: 500 });
  }

  return undefined;
}

/**
 * Proxies a request to a local development server.
 */
export async function proxyRequest(
  request: Request,
  targetPort: number,
  server?: Server<WsProxyData>
): Promise<Response> {
  // Handle WebSocket upgrade requests
  if (isWebSocketUpgrade(request)) {
    if (!server) {
      debug("WebSocket upgrade requested but no server reference provided");
      return new Response("WebSocket upgrades require server reference", { status: 500 });
    }
    const result = await upgradeWebSocket(request, server, targetPort);
    if (result) {
      return result;
    }
    // Successful upgrade - return empty response (Bun handles the rest)
    return new Response(null, { status: 101 });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;
  const targetUrl = "http://localhost:" + targetPort + pathname + url.search;

  debug("Proxying request to: " + targetUrl);

  try {
    const headers = new Headers(request.headers);

    const originalHost =
      request.headers.get("Host") || request.headers.get("X-Forwarded-Host");
    if (originalHost) {
      headers.set("X-Forwarded-Host", originalHost);
    }

    const clientIp =
      request.headers.get("X-Forwarded-For") ||
      request.headers.get("X-Real-IP") ||
      "127.0.0.1";
    headers.set("X-Forwarded-For", clientIp);
    headers.set(
      "X-Forwarded-Proto",
      request.headers.get("X-Forwarded-Proto") || "https"
    );

    headers.set("Host", "localhost:" + targetPort);

    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: headers,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.clone().body
          : undefined,
    });

    const response = await fetch(proxyReq, { redirect: "manual" });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.delete("Content-Encoding");
    responseHeaders.delete("Content-Length");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(
      "Error connecting to server: " +
        (err instanceof Error ? err.message : String(err)),
      { status: 502 }
    );
  }
}

/**
 * Starts a development server for a static-build site.
 */
export async function startDevServer(
  sitePath: string,
  port: number,
  packageManager: string,
  devScript: string,
  siteSubdomain?: string
): Promise<boolean> {
  const siteName = siteSubdomain || require("path").basename(sitePath);

  if (processManager.hasProcess(siteName, port)) {
    debug("Dev server for " + siteName + " is already running on port " + port);
    return true;
  }

  info(
    "Starting dev server for " + siteName + " on port " + port + " with script: " + devScript
  );

  try {
    const success = await processManager.startProcess(
      siteName,
      port,
      devScript,
      sitePath,
      "static-build",
      { PACKAGE_MANAGER: packageManager, MODE: "dev" }
    );

    if (success) {
      info("Successfully started dev server for " + siteName + " on port " + port);
    } else {
      warn("Failed to start dev server for " + siteName + " on port " + port);
    }

    return success;
  } catch (err) {
    warn("Error starting dev server for " + siteName + ": " + err);
    return false;
  }
}
