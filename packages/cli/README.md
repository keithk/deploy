# Flexible Web CLI

Welcome to the Flexible Web CLI! This is your command-line toolkit for managing, building, and running your Flexible Web server and sites with ease. Inspired by the spirit of the old internet, our CLI makes it simple for anyone to get started hosting and customizing their own web playground.

## Getting Started

Install dependencies at the project root:

```bash
git clone https://github.com/yourusername/flexible-web.git
cd flexible-web
bun install
```

### Running CLI Commands

All CLI commands are run from the project root using Bun:

```bash
bun packages/cli/src/index.ts <command> [options]
```

Or, if you have a global install:

```bash
flexiweb <command> [options]
```

### Available Commands

```
list                     List all available sites and their commands
run <site> <command>     Run a command for a specific site
start                    Start the web server (serve mode)
dev                      Start the web server in development mode
build                    Build all static-build sites
help                     Show this help message

Options:
  --port, -p               Set the port for the web server (default: 3000)
  --root, -r               Set the root directory for sites (default: ./sites)
```

## Easy Server Setup

To set up your local development environment with HTTPS and subdomain routing, just run:

```sh
bun run setup:macos
```

This will:
- Install Caddy and dnsmasq if needed
- Configure subdomains like `blog.dev.flexi` to work locally
- Set up HTTPS for your local sites

For production, use:

```sh
bun run setup:production
```

This will walk you through deploying to your own domain (like `keith.is`).

## Building and Customizing Sites

The CLI is your gateway to building and customizing your own sites! Just add a folder to `/sites`, configure it, and use the CLI to build, run, or list your creations. Whether you’re making a static site, a dynamic app, or something totally unique, you’re in control.

## The Spirit of the Old Internet

Flexible Web is about making it easy and fun to carve out your own corner of the web. Hack, remix, and share—just like the early days. See `/sites` for examples and inspiration!

---

For more advanced usage, see the main project README or the docs.
