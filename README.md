# 🚀 Deploy

**Drop websites into a folder. They're instantly live with SSL. That's it.**

The simplest way to host multiple websites on one server. No config files, no SSL headaches, no complex setups. Just a `/sites` folder where every subdirectory becomes a live website.

_I built this to solve my own personal website hosting needs. You'll notice there are no tests. Feel free to make an issue or PR, but this isn't actively developed OSS—it's just my personal tool that I'm sharing. Take it, fork it, build a user system on top and host sites for your friends in your /sites folder. Add fediverse webhooks and turn it into a social network. Do whatever! I don't know!_

---

## 🚀 Quick Start

### Get a server running in 2 minutes

Spin up any Ubuntu server ($5 DigitalOcean droplet works great) and run:

```bash
curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/install.sh | sudo bash
```

Or with your own domain:

```bash
curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/install.sh | sudo bash -s yourdomain.com your@email.com
```

Done! You now have:

- ✅ Automatic SSL for any domain you point at it
- ✅ A `/sites` folder where you drop websites
- ✅ Instant subdomains for every site

### Add your first site

```bash
# Go to your sites folder
cd /opt/deploy/sites

# Create a new site (just make a folder!)
mkdir my-awesome-site
echo "<h1>Hello World!</h1>" > my-awesome-site/index.html

# That's it! Live at my-awesome-site.yourdomain.com
# (Deploy automatically detects and serves new sites)
```

### Or develop locally

```bash
# Install Bun and the CLI
curl -fsSL https://bun.sh/install | bash
bun install -g @keithk/deploy-cli

# Start a new project
deploy init my-project
cd my-project

# Add sites to the sites/ folder, then:
deploy start
```

---

## ✨ What makes this special?

- **Drop and go**: Copy files to `/sites/sitename/`, run one command, it's live
- **Zero config**: HTML, React, Node.js—whatever you put in works
- **Instant SSL**: Point any domain at your server, certificates happen automatically
- **Git-friendly**: Everything lives in a git repo, deploy with `git push`
- **Subdomain magic**: Every site gets `sitename.yourdomain.com` automatically
- **Actually simple**: No YAML, no Docker, no complex CI/CD

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

## 📦 Using Deploy Packages

You can install Deploy packages from npm:

```bash
# Install packages
bun add @keithk/deploy-cli
# or
bun add @keithk/deploy-core @keithk/deploy-actions @keithk/deploy-server
```

---

## 📚 Documentation

- [Getting Started](docs/getting-started.md)
- [Site Types](docs/site-types.md)
- [Custom Domains & SSL](docs/custom-domains.md)
- [Actions & Automation](docs/actions/index.md)
- [Bluesky Integration](docs/bluesky.md)

---

## 🦄 Why is this cool?

- **Caddy-powered SSL**: Custom domains, wildcard certs, and renewals—handled for you.
- **Simplicity**: Just drop in a site and go.
- **Use what you love**: HTML, React, or anything that serves files.
- **Automate everything**: Scheduled builds, webhooks, and more.

---

## MIT License
