# Deploying to Production

This guide walks through deploying Deploy to a fresh DigitalOcean droplet.

## Quick Start

SSH into your fresh Ubuntu droplet and run:

```bash
curl -fsSL https://raw.githubusercontent.com/keithk/deploy/feature/simplified-deploy/scripts/digitalocean-setup.sh | sudo bash
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
git checkout feature/simplified-deploy
bun install
bun run build
```

### 3. Interactive Setup

Run the setup wizard:

```bash
bun run deploy setup
```

You'll be asked:
- **Environment**: Production
- **Domain**: Your domain (e.g., `keith.business`)
- **HTTP Port**: 3000 (default)
- **SSH Port**: 2222 (default, or 22 if you want to use standard SSH)
- **Sites Directory**: `/var/deploy/sites`
- **SSH Public Key**: Paste your public key or path to `~/.ssh/id_ed25519.pub`

### 4. DNS Configuration

Point your domain to the droplet:

```
A     @              → [droplet IP]
A     *              → [droplet IP]
```

Or if using Cloudflare/other DNS:
- Root domain → droplet IP
- Wildcard subdomain → droplet IP

### 5. Start as Service

```bash
# Copy service file
sudo cp config/deploy.service /etc/systemd/system/

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable deploy
sudo systemctl start deploy

# Check status
sudo systemctl status deploy
```

### 6. Start Caddy

```bash
# Copy Caddyfile (generated during setup)
sudo cp config/Caddyfile /etc/caddy/Caddyfile

# Restart Caddy
sudo systemctl restart caddy
```

## Accessing the Dashboard

Once running, access the dashboard via SSH:

```bash
ssh your-domain.com -p 2222
```

This will display a login URL that you can open in your browser.

## File Structure

After setup, your deploy directory looks like:

```
/home/deploy/deploy/
├── data/
│   ├── deploy.db          # SQLite database
│   └── host_key           # SSH host key
├── config/
│   ├── Caddyfile          # Caddy configuration
│   └── authorized_keys    # SSH public keys
├── .env                   # Environment configuration
└── sites/                 # (or /var/deploy/sites/)
```

## Environment Variables

Created in `.env`:

```bash
PROJECT_DOMAIN=keith.business
PORT=3000
SSH_PORT=2222
SITES_DIR=/var/deploy/sites
NODE_ENV=production
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

### SSH connection refused

1. Check SSH server is running: `sudo systemctl status deploy`
2. Check port is open: `sudo ufw status`
3. Check firewall allows SSH port: `sudo ufw allow 2222/tcp`

### Sites not loading

1. Check DNS is pointing correctly: `nslookup subdomain.yourdomain.com`
2. Check Caddy is running: `sudo systemctl status caddy`
3. Check site container: `docker ps | grep sitename`

### Database issues

Reset database (warning: deletes all data):
```bash
rm data/deploy.db
bun run deploy setup
```

## Updating

```bash
cd /home/deploy/deploy
git pull
bun install
bun run build
sudo systemctl restart deploy
```
