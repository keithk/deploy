# Deploying to Production

This guide walks through deploying Deploy to a fresh DigitalOcean droplet.

> **Important**: Deploy uses SQLite for its database, which requires a persistent filesystem. This means **Heroku, Fly.io, Railway, and similar platforms won't work**. You need a traditional VPS with persistent storage.

## Quick Start

SSH into your fresh Ubuntu droplet and run:

```bash
curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/scripts/setup.sh | sudo bash
```

Then follow the interactive setup:

```bash
cd /home/deploy/deploy
sudo -u deploy bun run deploy setup
```

## Manual Setup

### 1. Prerequisites

Install on Ubuntu 22.04+:

```bash
# Bun
curl -fsSL https://bun.sh/install | bash

# Docker
apt-get update && apt-get install -y docker.io
systemctl enable docker && systemctl start docker

# Caddy
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

# Railpacks
curl -fsSL https://railpack.dev/install.sh | bash
```

### 2. Clone and Build

```bash
git clone https://github.com/keithk/deploy.git
cd deploy
bun install
bun run build:all
```

### 3. Interactive Setup

Run the setup wizard:

```bash
bun run deploy setup
```

You'll be asked:
- **Environment**: Production
- **Domain**: Your domain (e.g., `keith.is`)
- **HTTP Port**: 3000 (default)
- **Sites Directory**: `/var/deploy/sites`
- **Dashboard Password**: Min 8 characters (used to log into the admin dashboard)

### 4. DNS Configuration

Point your domain to the droplet:

```
A     @              → [droplet IP]
A     *              → [droplet IP]
```

Or if using Cloudflare/other DNS:
- Root domain → droplet IP
- Wildcard subdomain → droplet IP

### 5. Systemd Service

Create `/etc/systemd/system/deploy.service`:

```ini
[Unit]
Description=Deploy Server
After=network.target docker.service caddy.service
Requires=docker.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/home/deploy/deploy
ExecStart=/usr/local/bin/bun packages/cli/src/index.ts start --foreground
Restart=on-failure
RestartSec=10

StandardOutput=journal
StandardError=journal

Environment=NODE_ENV=production
Environment=PROJECT_DOMAIN=keith.is
Environment=ROOT_DIR=/var/deploy/sites
Environment=PATH=/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=BUILDKIT_HOST=docker-container://buildkit

LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

Then enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable deploy
sudo systemctl start deploy
sudo systemctl status deploy
```

### 6. Caddy

Copy the generated Caddyfile and restart Caddy:

```bash
sudo cp config/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

## Accessing the Dashboard

Visit `https://admin.yourdomain.com` in your browser.

- **First time**: You'll see a "Set Password" page. Create your admin password.
- **After setup**: You'll see a login page. Enter your password.

If you forget your password, reset it from the server:

```bash
cd /home/deploy/deploy
bun run deploy auth set-password
```

## File Structure

After setup, your deploy directory looks like:

```
/home/deploy/deploy/
├── data/
│   └── dialup-deploy.db  # SQLite database
├── config/
│   └── Caddyfile          # Caddy configuration
├── logs/                   # Server logs
├── .env                   # Environment configuration
└── sites/                 # (or /var/deploy/sites/)
```

## Environment Variables

The systemd service sets environment variables directly. The `.env` file is also read:

```bash
PROJECT_DOMAIN=keith.is
PORT=3000
SITES_DIR=/var/deploy/sites
NODE_ENV=production
BUILDKIT_HOST=docker-container://buildkit
```

## Troubleshooting

### Check logs

```bash
# Deploy server logs
sudo journalctl -u deploy -f

# Caddy logs
sudo journalctl -u caddy -f

# Docker container logs
docker logs deploy-sitename
```

### Sites not loading

1. Check DNS is pointing correctly: `nslookup subdomain.yourdomain.com`
2. Check Caddy is running: `sudo systemctl status caddy`
3. Check site container: `docker ps | grep sitename`

### Port already in use on restart

If `systemctl restart deploy` fails with EADDRINUSE, the old process may not have released the port yet:

```bash
sudo systemctl stop deploy
# Kill any orphaned bun processes
sudo pkill -9 -u deploy bun
sleep 3
sudo systemctl start deploy
```

### Database issues

Reset database (warning: deletes all data):

```bash
rm data/dialup-deploy.db
bun run deploy setup
```

## Updating

```bash
cd /home/deploy/deploy
git pull
bun install
bun run build:all
sudo systemctl restart deploy
```

If the restart fails (port conflict from old process):

```bash
sudo systemctl stop deploy
sudo pkill -9 -u deploy bun
sleep 3
sudo systemctl start deploy
```
