# Site Types

DialUpDeploy supports multiple ways to build and serve your sites. Pick what fits your project—mix and match as needed.

---

## 📄 Static Sites

**Drop your HTML, CSS, and JS in a folder. That's it.**

Perfect for: Personal sites, portfolios, landing pages, or any basic website.

```json
{
  "type": "static"
}
```

---

## ⚡ Dynamic Sites

**Write a `handleRequest` function for custom logic.**

Perfect for: APIs, server-rendered pages, or anything that needs to think on its feet.

```json
{
  "type": "dynamic",
  "entryPoint": "index"
}
```

Example:

```typescript
// sites/api/index.ts
export function handleRequest(request: Request): Response | Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/") {
    return Response.json({ message: "Hello, internet!" });
  }

  return new Response("Not found", { status: 404 });
}
```

---

## 🔄 Passthrough Sites

**Already running something? Just tell us the port, and we'll send traffic there.**

Perfect for: Existing apps or services you don't want to modify. These should have a `start` and `dev` command in their package manager. We currently support yarn, npm, bun, and pnpm.

```json
{
  "type": "passthrough",
  "proxyPort": 3001
}
```

---

## 🏗️ Static-build Sites

**Modern framework? No problem. Use your dev server in development, serve built files in production.**

Perfect for: Eleventy, Astro or any static site generator.

```json
{
  "type": "static-build",
  "buildDir": "dist",
  "devPort": 8080,
  "commands": {
    "dev": "eleventy --serve",
    "build": "eleventy"
  }
}
```

---

For all configuration options, see [Configuration](configuration.md).
