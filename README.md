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
- **Solid process management**: CPU/memory monitoring, auto-restarts, health checks
- **Real-time monitoring**: Watch your processes live with `deploy processes watch`

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

# Process management
deploy processes list --resources --health    # List with CPU/memory usage
deploy processes watch --resources            # Real-time monitoring dashboard
deploy processes stats <site:port>            # Detailed process statistics
deploy processes restart <site:port>          # Restart a specific process
deploy processes stop <site:port>             # Stop a process
deploy processes kill <site:port>             # Force kill a process
deploy processes logs <site> <port>           # View process logs
```

## 📊 Process Management & Monitoring

Deploy includes built-in process management for keeping your sites running smoothly in production:

### Real-time Monitoring
```bash
# Watch all processes with live CPU/memory stats
deploy processes watch --resources

# View detailed statistics for a specific process
deploy processes stats my-site:3000

# List all processes with health and resource info
deploy processes list --resources --health
```

### Resource Management
Set resource limits via environment variables in your site's configuration:

```bash
# In your site's .env or process environment
MAX_MEMORY=536870912        # 512MB memory limit
MAX_CPU=80                  # 80% CPU limit
RESTART_ON_LIMIT=true       # Auto-restart when exceeded
MAX_RESTARTS=5              # Max restart attempts
RESTART_WINDOW=300000       # 5-minute restart window
```

### Health Monitoring
- Automatic health checks every 30 seconds
- Exponential backoff for failed restarts
- Process resource tracking and history
- Graceful shutdown handling
- Comprehensive error logging

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
- **Smart monitoring**: Track CPU/memory usage, set resource limits, get restart statistics.
- **Developer experience**: Beautiful CLI with real-time dashboards and colored output.

---

## MIT License
