import {
  defineAction,
  defineRouteAction,
  defineHookAction,
  ActionContext,
  ActionResult
} from "@dialup-deploy/core";

/**
 * Example 1: Basic action
 *
 * This action can be executed directly and will return a simple greeting.
 */
export const basicAction = defineAction({
  id: "hello-world",
  type: "example",
  async handler(payload: any, context: ActionContext): Promise<ActionResult> {
    console.log("Hello World action executed!");

    return {
      success: true,
      message: "Hello, world!",
      data: {
        timestamp: new Date().toISOString(),
        payload
      }
    };
  }
});

/**
 * Example 2: Route action
 *
 * This action exposes a route at /api/hello that returns a greeting.
 */
export const routeAction = defineRouteAction({
  id: "hello-api",
  routes: [
    {
      path: "/api/hello",
      method: "GET",
      handler: async (
        request: Request,
        context: ActionContext
      ): Promise<Response> => {
        const url = new URL(request.url);
        const name = url.searchParams.get("name") || "World";

        return new Response(
          JSON.stringify({
            message: `Hello, ${name}!`,
            timestamp: new Date().toISOString()
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }
    }
  ],
  async handler(payload: any, context: ActionContext): Promise<ActionResult> {
    return {
      success: true,
      message: "Hello API action executed directly",
      data: { payload }
    };
  }
});

/**
 * Example 3: Hook action
 *
 * This action runs when the server starts and logs a message.
 */
export const hookAction = defineHookAction({
  id: "server-startup",
  hooks: ["server:after-start"],
  async handler(payload: any, context: ActionContext): Promise<ActionResult> {
    console.log("=================================");
    console.log("🚀 Server has started successfully!");
    console.log(`🕒 Started at: ${new Date().toISOString()}`);
    console.log(`🌐 Mode: ${context.mode}`);
    console.log(`📂 Root directory: ${context.rootDir}`);
    console.log(`🔢 Number of sites: ${context.sites.length}`);
    console.log("=================================");

    return {
      success: true,
      message: "Server startup hook executed",
      data: {
        timestamp: new Date().toISOString(),
        siteCount: context.sites.length
      }
    };
  }
});

// Export the hook action as default
export default hookAction;
