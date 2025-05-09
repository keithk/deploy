import { ActionRegistry } from "../actions/registry";
import type { ActionContext } from "@dialup-deploy/core";

/**
 * Middleware for handling webhook requests
 * @param registry The action registry
 * @param context The action context
 * @returns A function that processes webhook requests and returns a Response
 */
export function webhookMiddleware(
  registry: ActionRegistry,
  context: ActionContext
) {
  return async (request: Request): Promise<Response> => {
    // Check if this is a webhook request
    const url = new URL(request.url);
    const path = url.pathname;

    // Extract the webhook type from the path
    // Format: /webhook/:type (e.g., /webhook/github)
    const pathParts = path.split("/");
    const webhookType = pathParts.length > 2 ? pathParts[2] : null;

    if (!webhookType) {
      return Response.json(
        {
          success: false,
          message: "Invalid webhook path. Use /webhook/:type"
        },
        { status: 400 }
      );
    }

    // Get all webhook actions
    const allWebhookActions = registry.getByType("webhook");
    console.log(
      `[DEBUG] All webhook actions:`,
      allWebhookActions.map((a) => a.id)
    );

    // Filter for this webhook type
    const actions = allWebhookActions.filter(
      (action) =>
        action.id === webhookType || action.id.endsWith(`-${webhookType}`)
    );
    console.log(
      `[DEBUG] Matching webhook actions for type '${webhookType}':`,
      actions.map((a) => a.id)
    );

    if (actions.length === 0) {
      return Response.json(
        {
          success: false,
          message: `No webhook handler found for type: ${webhookType}`
        },
        { status: 404 }
      );
    }

    // Get the request body
    let body: any;
    let rawBody: string;

    try {
      // Get the raw body for signature verification
      rawBody = await request.text();

      // Parse the body as JSON
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch (error) {
      return Response.json(
        {
          success: false,
          message: "Invalid JSON payload"
        },
        { status: 400 }
      );
    }

    // Get the signature from headers
    const signature =
      request.headers.get("X-Hub-Signature-256") ||
      request.headers.get("X-Signature") ||
      null;

    // Prepare the payload with additional context
    const payload = {
      ...body,
      rawBody,
      signature,
      headers: Object.fromEntries(Array.from(request.headers.entries())),
      query: Object.fromEntries(url.searchParams.entries())
    };

    // Execute all matching actions
    const results = [];

    for (const action of actions) {
      try {
        const result = await registry.execute(action.id, payload, context);
        results.push({
          action: action.id,
          ...result
        });
      } catch (error) {
        results.push({
          action: action.id,
          success: false,
          message: `Error executing action: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      }
    }

    // Return the results
    return Response.json({
      success: results.some((r) => r.success),
      message: `Processed ${results.length} webhook actions`,
      results
    });
  };
}
