# 🚀 DialUpDeploy

**The fastest way I've found to get a site online—HTML, React, whatever. No config required. No SSL headaches. Just websites!**

_I built this to solve my own personal website hosting needs. You'll notice there are no tests. Feel free to make an issue or PR, but this isn't actively developed OSS—it's just my personal tool that I'm sharing. Take it, fork it, build a user system on top and host sites for your friends in your `/sites` folder. Add fediverse webhooks and turn it into a social network. Do whatever! I don't know!_

---

## 🟢 Installation Options

### Option 1: One-Command Server Install (Ubuntu/DigitalOcean)

Spin up a new server and run:

```bash
curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/install.sh | sudo bash
```

Or, with your own domain and email:

```bash
curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/install.sh | sudo bash -s yourdomain.com your@email.com
```

- Installs everything (Bun, Caddy, dependencies)
- Sets up wildcard SSL with Caddy (no manual certs, ever)
- You get instant subdomains, custom domains, and HTTPS—automagically

### Option 2: Install CLI Only

If you just want the CLI to manage your sites:

```bash
# Install Bun if you don't have it
curl -fsSL https://bun.sh/install | bash

# Install the CLI globally
bun install -g @dialup-deploy/cli

# Initialize a new project
deploy init my-project
cd my-project

# Create your first site
deploy site create my-site

# Start the server
deploy start
```

---

## ✨ What is DialUpDeploy?

It's a CLI tool I built because I was tired of complex deployment setups. It handles any kind of site—static HTML, React builds, or your own Node servers. Self-hosted and straightforward.

- Create sites with a single command
- Get a subdomain and SSL instantly (thanks to Caddy)
- Custom domains? Just add them—SSL is handled automatically
- Built-in actions & webhooks for automation
- Built for my specific needs, but maybe it works for yours too

## 🛠️ CLI Commands

```bash
# Initialize a new project
deploy init [directory]

# Set up the project for local development or production
deploy setup [local|production]

# Create a new site
deploy site create my-site --type static|static-build|dynamic|passthrough

# List all sites
deploy site list

# Start the server
deploy start

# Run actions
deploy action run [action-id]

# Update Caddyfile
deploy caddyfile update
```

---

## 📚 Documentation

- [Getting Started](docs/getting-started.md)
- [Site Types](docs/site-types.md)
- [Custom Domains & SSL](docs/custom-domains.md)
- [Actions & Automation](docs/actions.md)
- [Bluesky Integration](docs/bluesky.md)

---

## 🦄 Why is this cool?

- **Caddy-powered SSL**: Custom domains, wildcard certs, and renewals—handled for you.
- **Simplicity**: Just drop in a site and go.
- **Use what you love**: HTML, React, or anything that serves files.
- **Automate everything**: Scheduled builds, webhooks, and more.

---

## MIT License
