# Deploy

**Paste a Git URL. Get a live website with SSL. That's it.**

A personal deployment platform that auto-detects your stack and deploys it. No Dockerfiles, no config files, no YAML. Just a clean web dashboard where you paste Git URLs and get live sites.

> I built this to host my own sites. It's not actively developed OSS—just my personal tool that I'm sharing. Fork it, extend it, do whatever.

---

## Quick Start

### 1. Run the setup script on a fresh Ubuntu server

```bash
curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/scripts/setup.sh | sudo bash
```

This installs everything: Bun, Docker, Caddy, and [Railpack](https://railpack.dev) (the magic that auto-detects your stack).

### 2. Run the setup wizard

```bash
cd /home/deploy/deploy
sudo -u deploy bun run deploy setup
```

You'll be asked for:
- **Domain**: e.g., `yourdomain.com`
- **SSH public key**: For dashboard authentication

### 3. Start the server

```bash
sudo systemctl start deploy
```

### 4. Access your dashboard

```bash
ssh yourdomain.com -p 2222
```

This prints a magic login link. Open it in your browser—you're in.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                         Dashboard                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  + New Site                                          │    │
│  │  ─────────────────────────────────────────────────   │    │
│  │  Git URL: https://github.com/you/your-site.git       │    │
│  │  Subdomain: your-site                                │    │
│  │                                    [Create Site]     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Railpack detects: Astro, Next.js, Python, Ruby, Rust...    │
│  Builds Docker image automatically                          │
│  Starts container on auto-assigned port                     │
│  Caddy routes traffic with automatic SSL                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
            🎉 Live at https://your-site.yourdomain.com
```

### What you get

- **Zero config deployments**: Railpack detects Node, Python, Ruby, Go, Rust, static sites, and more
- **Automatic SSL**: Caddy handles certificates for all your subdomains
- **GitHub autodeploy**: Toggle it on, push to main, site updates automatically
- **Persistent storage**: Enable `/data` volumes that survive redeploys
- **Build & runtime logs**: Watch deployments in real-time
- **Environment variables**: Set secrets per-site via the dashboard

---

## Authentication

Deploy uses SSH key authentication. If your public key is in the server's `authorized_keys`, you can SSH to get a dashboard session:

```bash
ssh yourdomain.com -p 2222
```

You'll see:
```
╔══════════════════════════════════════════╗
║         Welcome to Deploy                ║
╚══════════════════════════════════════════╝

Dashboard: https://admin.yourdomain.com?token=abc123

This link is valid for 7 days.
```

Open that link—you're authenticated. The token is stored as a cookie.

---

## Requirements

- **Ubuntu server** (tested on 22.04+, DigitalOcean droplets work great)
- **Domain with wildcard DNS** pointing to your server
- **SQLite storage** — Deploy uses SQLite, so it needs a persistent filesystem. This means **Heroku, Fly.io, and similar platforms won't work**. Use a VPS.

### DNS Setup

Point your domain to your server:

```
A     @     →  your.server.ip
A     *     →  your.server.ip
```

Or with Cloudflare/other DNS providers, set up the root and wildcard to your server IP.

---

## CLI Commands

The CLI is for server administration only. All site management happens in the dashboard.

```bash
# Initial setup
deploy setup              # Interactive setup wizard

# Server management
deploy start              # Start the server (daemon mode)
deploy start --foreground # Start in foreground (for debugging)
deploy restart            # Restart the server
deploy doctor             # Run diagnostics
deploy update             # Pull latest code and restart
```

---

## Documentation

- [Getting Started](docs/getting-started.md) — Detailed setup walkthrough
- [Custom Domains](docs/custom-domains.md) — Using your own domains
- [Persistent Storage](docs/persistent-storage.md) — Data that survives redeploys
- [Actions](docs/actions/index.md) — Scheduled tasks, webhooks, and automation
- [Deployment Guide](docs/DEPLOYMENT.md) — Production deployment details

---

## How Railpack Works

[Railpack](https://railpack.dev) analyzes your codebase and builds an optimized Docker image:

- Detects language/framework from files (package.json, Gemfile, requirements.txt, Cargo.toml, etc.)
- Installs dependencies
- Runs build commands
- Creates a minimal production image
- Handles the PORT environment variable automatically

For most projects, it just works. It's the replacement that the very smart people at Railpack have come up with to replace Heroku Buildpacks. If you need to customize the build, add a `railpack.json`:

```json
{
  "$schema": "https://schema.railpack.com",
  "deploy": {
    "startCommand": "bun run start"
  }
}
```

---

## License

MIT
