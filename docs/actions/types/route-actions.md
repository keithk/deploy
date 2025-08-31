# 🌐 Route Actions

Expose custom HTTP endpoints for your site.

## Basic Configuration

```typescript
// sites/mysite/.dialup/actions/api-routes.ts
import { defineRouteAction } from "@keithk/deploy";

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
| `auth`      | `boolean \| AuthOptions`          | (Optional) Authentication requirements for the route |
| `cors`      | `boolean \| CorsOptions`          | (Optional) CORS configuration for the route          |
| `cache`     | `boolean \| CacheOptions`         | (Optional) Caching configuration for the route       |
| `rateLimit` | `boolean \| RateLimitOptions`     | (Optional) Rate limiting configuration for the route |

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

## Authentication

You can add authentication to your routes:

```typescript
// sites/mysite/.dialup/actions/protected-routes.ts
import { defineRouteAction } from "@keithk/deploy";

export default defineRouteAction({
  id: "protected-routes",
  routes: [
    {
      path: "/api/protected",
      method: "GET",
      // Simple authentication check
      auth: true, // Uses default authentication
      handler: async (request, context) => {
        // The request has already been authenticated
        const user = context.user;

        return new Response(
          JSON.stringify({
            message: `Hello, ${user.name}!`,
            user
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    },
    {
      path: "/api/custom-auth",
      method: "GET",
      // Custom authentication
      auth: {
        // Custom authentication logic
        handler: async (request, context) => {
          const authHeader = request.headers.get("Authorization");

          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return {
              authenticated: false,
              error: "Missing or invalid Authorization header"
            };
          }

          const token = authHeader.split(" ")[1];

          // Validate the token (example)
          if (token === context.env?.API_TOKEN) {
            return {
              authenticated: true,
              user: { id: "system", name: "System" }
            };
          }

          return {
            authenticated: false,
            error: "Invalid token"
          };
        }
      },
      handler: async (request, context) => {
        // The request has been authenticated by the custom auth handler
        return new Response(
          JSON.stringify({
            message: "Custom auth successful"
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }
  ]
});
```

## CORS Configuration

Enable Cross-Origin Resource Sharing (CORS) for your routes:

```typescript
// sites/mysite/.dialup/actions/cors-routes.ts
import { defineRouteAction } from "@keithk/deploy";

export default defineRouteAction({
  id: "cors-routes",
  routes: [
    {
      path: "/api/public",
      method: "GET",
      // Simple CORS configuration
      cors: true, // Enables CORS with default settings
      handler: async (request, context) => {
        return new Response(JSON.stringify({ message: "Public API" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    },
    {
      path: "/api/restricted",
      method: "GET",
      // Custom CORS configuration
      cors: {
        origin: ["https://allowed-domain.com", "https://another-domain.com"],
        methods: ["GET", "POST"],
        allowHeaders: ["Content-Type", "Authorization"],
        exposeHeaders: ["X-Custom-Header"],
        credentials: true,
        maxAge: 86400 // 24 hours
      },
      handler: async (request, context) => {
        return new Response(JSON.stringify({ message: "Restricted API" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  ]
});
```

## Example: REST API

```typescript
// sites/mysite/.dialup/actions/users-api.ts
import { defineRouteAction } from "@keithk/deploy";

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
