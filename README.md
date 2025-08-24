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

### Or clone from GitHub (the developer way!)

```bash
# Go to your sites folder
cd /opt/deploy/sites

# Clone your site directly from GitHub
git clone https://github.com/yourusername/your-site.git

# Add a simple config.json to tell Deploy what type of site it is
echo '{"type": "static"}' > your-site/config.json

# Boom! Your GitHub repo is now live at your-site.yourdomain.com
# Deploy with git push, update with git pull
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

- **Drop and go**: Copy files to `/sites/sitename/`, it's instantly live
- **Git native**: `git clone` your sites, `git pull` to deploy updates
- **Zero config**: HTML, React, Node.js, Astro—whatever you put in works
- **Instant SSL**: Point any domain at your server, certificates happen automatically
- **Subdomain magic**: Every site gets `sitename.yourdomain.com` automatically
- **Actually simple**: No YAML, no complex configurations
- **Solid process management**: CPU/memory monitoring, auto-restarts, health checks
- **Real-time monitoring**: Watch your processes live with `deploy processes watch`
- **DigitalOcean ready**: One-command install on any $5 droplet

## 🛠️ CLI Commands

### Project & Setup Commands

```bash
# Initialize a new project
deploy init [directory]

# Set up the project for local development or production
deploy setup [local|production]
```

### Site Management Commands

```bash
# Create a new site with optional type
deploy site create my-site 
  # Optional type flags:
  # --type static       # Basic HTML/CSS/JS site (default)
  # --type static-build # Sites with build step (Astro, Eleventy)
  # --type dynamic      # Custom server-side logic
  # --type passthrough  # Existing services
  # --type docker       # Containerized applications

# List all sites in the project
deploy site list
  # Optional flags:
  # --detailed          # Show more information
  # --json              # Output as JSON
```

### Server & Runtime Commands

```bash
# Start the server
deploy start

# Run specific actions
deploy action run [action-id]

# Update Caddyfile configuration
deploy caddyfile update
```

### Process Management Commands

```bash
# List processes with resources and health
deploy processes list 
  # Optional flags:
  # --resources         # Show CPU/memory usage
  # --health            # Display process health

# Real-time process monitoring
deploy processes watch 
  # Optional flags:
  # --resources         # Show live resource stats

# Detailed process management
deploy processes stats <site:port>     # Detailed stats
deploy processes restart <site:port>   # Restart process
deploy processes stop <site:port>      # Stop process
deploy processes kill <site:port>      # Force kill
deploy processes logs <site> <port>    # View logs
```

## 📊 Process Management & Monitoring

Deploy includes built-in process management for keeping your sites running smoothly in production.

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
# Install CLI
bun add @keithk/deploy-cli

# Or install individual packages
bun add @keithk/deploy-core @keithk/deploy-actions @keithk/deploy-server
```

---

## 📚 Documentation

- [Getting Started](docs/getting-started.md)
- [Site Types](docs/site-types.md)
- [Custom Domains & SSL](docs/custom-domains.md)
- [Actions & Automation](docs/actions/index.md)

---

## 🦄 Real-world examples

**Personal portfolio**: `git clone` your GitHub portfolio, add `{"type": "static"}` config, done.

**Astro blog**: Clone your Astro site, add `{"type": "static-build", "buildDir": "dist"}`, it builds and deploys automatically.

**Next.js app**: `{"type": "passthrough", "proxyPort": 3000}` and it proxies to your running Next.js server.

**API microservice**: `{"type": "dynamic"}` with a simple `handleRequest` function for custom server logic.

**Dockerized app**: `{"type": "docker", "dockerFile": "Dockerfile"}` for containerized deployments.

**Multiple sites**: Drop 5 different projects in `/sites`, each gets its own subdomain with SSL.

## 🦄 Why is this cool?

- **Caddy-powered SSL**: Custom domains, wildcard certs, and renewals—handled for you.
- **Simplicity**: Just drop in a site and go.
- **Use what you love**: HTML, React, or anything that serves files.
- **Automate everything**: Scheduled builds, webhooks, and more.
- **Smart monitoring**: Track CPU/memory usage, set resource limits, get restart statistics.
- **Developer experience**: Beautiful CLI with real-time dashboards and colored output.

---

## MIT License