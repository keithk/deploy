import { debug, info } from "./logging";

/**
 * Proxies a request to a local development server.
 *
 * @param request The original request
 * @param targetPort The port of the target development server
 * @returns A Response object
 */
export async function proxyRequest(
  request: Request,
  targetPort: number
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const targetUrl = `http://localhost:${targetPort}${pathname}${url.search}`;

  debug(`Proxying request to: ${targetUrl}`);

  try {
    // Create a new headers object to ensure we're not modifying the original
    const headers = new Headers(request.headers);

    // Set headers that dev servers might need
    headers.set("Host", `localhost:${targetPort}`);

    // Create the proxy request with the modified headers
    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: headers,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.clone().body
          : undefined
    });

    const response = await fetch(proxyReq);

    // Create a new headers object for the response
    const responseHeaders = new Headers(response.headers);

    // Ensure CORS headers are set correctly
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (err) {
    return new Response(
      `Error connecting to server: ` +
        (err instanceof Error ? err.message : String(err)),
      { status: 502 }
    );
  }
}
