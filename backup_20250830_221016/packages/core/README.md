# Flexible Web Core

This is the heart of Flexible Web—the core library that powers site discovery, configuration, routing, and more.

## What Does Core Do?

- Discovers and loads sites from `/sites`
- Handles configuration (`config.json` per site)
- Provides utilities for routing, subdomains, and dynamic mounting
- Exposes APIs for building your own site types

## Customizing Your Experience

Want to make Flexible Web your own? The core package is designed for hacking and extension. Build new site types, add custom configuration, or wire up your own plugins.

### Example: Custom Site Type

You can add new logic for site detection, build steps, or runtime behavior by extending the core APIs. See the code and comments for extension points!

## Building Your Own Sites

Add new folders in `/sites` and configure each with a `config.json`. The core will automatically detect and load them based on their type (static, dynamic, static-build, passthrough).

### Configuration Structure

Each site is configured with a `config.json` file that defines its behavior:

```json
{
  "type": "static-build",
  "buildDir": "dist",
  "commands": {
    "dev": "eleventy --serve",
    "build": "eleventy"
  },
  "subdomain": "my-site",
  "default": false,
  "actions": [
    {
      "id": "nightly-build",
      "type": "scheduled",
      "command": "bun run build",
      "cron": "0 3 * * *",
      "triggerBuild": true
    }
  ]
}
```

The configuration loader will automatically merge settings from `config.json` with any scripts defined in `package.json` and auto-detect appropriate values when possible.

## The Old Internet Spirit

Flexible Web Core is all about empowerment—giving you the tools to create, remix, and share your own web spaces. Dive in, experiment, and make something uniquely yours!

---

For a full guide to configuration and advanced usage, see the main project README or the docs.
