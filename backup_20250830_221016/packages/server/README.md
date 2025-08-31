# Flexible Web Server

This is the Flexible Web Server package—the Bun-powered server that brings your sites to life! It handles routing, subdomain magic, HTTPS, and all the plumbing so you can focus on building awesome web experiences.

## What Does the Server Do?

- Serves static, dynamic, static-build, and passthrough sites from `/sites`
- Handles subdomain routing (e.g., `blog.dev.flexi`, `api.dev.flexi`)
- Supports custom domains (see site `deploy.json`)
- Integrates with Caddy for HTTPS (local and production)
- Runs with Bun for speed and simplicity

## Getting Started

Start the server (after setup):

```bash
bun packages/cli/src/index.ts start
```

Or in development mode:

```bash
bun packages/cli/src/index.ts dev
```

## Local HTTPS & Subdomains

After running the setup script (`bun run setup:macos`), you can access your sites at URLs like:

- https://dev.flexi
- https://blog.dev.flexi

## Building and Serving Sites

The server works hand-in-hand with the CLI and core packages. Add your sites to `/sites`, configure them, and the server will do the rest—serving static files, mounting dynamic apps, or proxying to external servers.

## Customizing & Hacking

Want to dig deeper? The server is designed for extension. Add new middleware, change routing logic, or integrate new protocols. Check out the code in `src/` for entry points.

## The Joy of Making Websites

Flexible Web Server is about lowering the barriers to web creativity. Whether you’re building a personal homepage, a blog, or something wild, this server makes it fun and easy—just like the early web!

---

For more details on advanced setup and deployment, see the main project README or the docs.
