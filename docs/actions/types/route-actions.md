# 🌐 Route Actions

Expose custom HTTP endpoints for your site.

## Basic Configuration

```typescript
// sites/mysite/.deploy/actions/api-routes.ts
import { defineRouteAction } from "@keithk/deploy-actions";

export default defineRouteAction({
  id: "api-routes",
  routes: [
    {
      path: "/api/hello",
      method: "GET",
      handler: async (request, context) => {
        return new Response(JSON.stringify({ message: "Hello, world!" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    },
    {
      path: "/api/data",
      method: "POST",
      handler: async (request, context) => {
        const data = await request.json();
        // Process the data
        return new Response(JSON.stringify({ success: true, data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  ]
});
```

## Route Configuration Options

Each route in a route action can be configured with the following options:

| Option      | Type                              | Description                                          |
| ----------- | --------------------------------- | ---------------------------------------------------- |
| `path`      | `string`                          | The URL path for the route (e.g., `/api/users`)      |
| `method`    | `"GET" \| "POST" \| "PUT" \| ...` | The HTTP method for the route                        |
| `handler`   | `(request, context) => Response`  | The function that handles the request                |
| `middleware`| `((request, context) => Request \| Response)[]` | (Optional) Middleware functions run before the handler |

## Working with Requests and Responses

Route actions use the standard Web API `Request` and `Response` objects:

```typescript
// Example route handler
async (request, context) => {
  // Access request properties
  const url = request.url;
  const method = request.method;
  const headers = request.headers;

  // Parse request body based on content type
  let body;
  if (request.headers.get("content-type")?.includes("application/json")) {
    body = await request.json();
  } else if (request.headers.get("content-type")?.includes("form")) {
    body = await request.formData();
  } else {
    body = await request.text();
  }

  // Create and return a response
  return new Response(JSON.stringify({ success: true, data: body }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Custom-Header": "Custom Value"
    }
  });
};
```

## Middleware

Use the `middleware` array to run logic before the handler — for authentication,
CORS, logging, or any other pre-processing. Each middleware receives the request
and context, and can either return a modified `Request` (to pass to the next
middleware or handler) or a `Response` (to short-circuit):

```typescript
// sites/mysite/.deploy/actions/protected-routes.ts
import { defineRouteAction } from "@keithk/deploy-actions";

// Example: token-checking middleware
function requireToken(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid Authorization header" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  return req; // Pass through to the handler
}

// Example: CORS middleware
function setCorsHeaders(req: Request) {
  // Attach headers by returning a new request — the handler will set
  // response headers, but you can also short-circuit OPTIONS here.
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }
  return req;
}

export default defineRouteAction({
  id: "protected-routes",
  routes: [
    {
      path: "/api/protected",
      method: "GET",
      middleware: [setCorsHeaders, requireToken],
      handler: async (request, context) => {
        return new Response(
          JSON.stringify({ message: "Authenticated request" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  ]
});
```

## Example: REST API

```typescript
// sites/mysite/.deploy/actions/users-api.ts
import { defineRouteAction } from "@keithk/deploy-actions";

// Mock database
const users = [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@example.com" }
];

export default defineRouteAction({
  id: "users-api",
  routes: [
    // Get all users
    {
      path: "/api/users",
      method: "GET",
      handler: async (request, context) => {
        return new Response(JSON.stringify({ users }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    },

    // Get user by ID
    {
      path: "/api/users/:id",
      method: "GET",
      handler: async (request, context) => {
        // Extract the ID from the URL
        const url = new URL(request.url);
        const id = parseInt(url.pathname.split("/").pop() || "0");

        // Find the user
        const user = users.find((u) => u.id === id);

        if (!user) {
          return new Response(
            JSON.stringify({
              error: "User not found"
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        return new Response(JSON.stringify({ user }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    },

    // Create a new user
    {
      path: "/api/users",
      method: "POST",
      handler: async (request, context) => {
        // Parse the request body
        const body = await request.json();

        // Validate the input
        if (!body.name || !body.email) {
          return new Response(
            JSON.stringify({
              error: "Name and email are required"
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        // Create a new user
        const newUser = {
          id: users.length + 1,
          name: body.name,
          email: body.email
        };

        // Add to the "database"
        users.push(newUser);

        return new Response(
          JSON.stringify({
            message: "User created",
            user: newUser
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }
  ]
});
```

## Related Documentation

- [Environment Variables & Context](../index.md#🔑-environment-variables--context)
- [Action File Location](../index.md#📂-action-file-location)
