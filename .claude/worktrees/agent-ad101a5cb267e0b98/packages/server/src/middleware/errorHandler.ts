/**
 * Simple error handler middleware for Bun.serve.
 * Catches errors and returns a friendly message.
 */

export const errorHandler = {
  /**
   * Wraps a request handler function with error handling
   * @param handler The request handler function to wrap
   * @returns A new handler function with error handling
   */
  wrap: (handler: (request: Request) => Promise<Response>) => {
    return async (request: Request): Promise<Response> => {
      try {
        return await handler(request);
      } catch (err) {
        console.error("Error:", err);
        return new Response("Internal Server Error", { status: 500 });
      }
    };
  }
};
