# Getting Started

This guide walks you through setting up Deploy on a fresh server and deploying your first site.

---

## Prerequisites

- **A VPS running Ubuntu 22.04+** (DigitalOcean, Linode, Vultr, etc.)
- **A domain name** with DNS you can control
- **An SSH key** on your local machine

> **Important**: Deploy uses SQLite for its database, which requires a persistent filesystem. This means **Heroku, Fly.io, Railway, and similar platforms won't work**. You need a traditional VPS.

---

## Step 1: Server Setup

SSH into your fresh Ubuntu server and run the setup script:

```bash
curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/scripts/setup.sh | sudo bash
```

This installs:
- **Bun** — JavaScript runtime
- **Docker** — Container runtime
- **Caddy** — Reverse proxy with automatic SSL
- **Railpack** — Auto-detection and container building

The script takes a few minutes. When it's done, you'll see next steps.

---

## Step 2: Configure Deploy

Run the interactive setup wizard:

```bash
cd /home/deploy/deploy
sudo -u deploy bun run deploy setup
```

The wizard asks for:

| Prompt | Description | Example |
|--------|-------------|---------|
| Environment | Local or Production | `Production Server` |
| Domain | Your domain name | `yourdomain.com` |
| HTTP Port | Server port | `3000` (default) |
| SSH Port | Auth port | `2222` (default) |
| Sites Directory | Where sites live | `/var/deploy/sites` |
| SSH Public Key | Your public key | `~/.ssh/id_ed25519.pub` |

The wizard creates:
- `.env` with your configuration
- `data/` directory for the SQLite database
- `data/authorized_keys` with your SSH key
- `data/host_key` for SSH server identity
- `config/Caddyfile` for reverse proxy

---

## Step 3: Configure DNS

Point your domain to your server. You need two records:

```
A     @     →  your.server.ip.address
A     *     →  your.server.ip.address
```

The wildcard (`*`) record is important—it lets all subdomains route to your server.

If using Cloudflare, make sure the records are set to "DNS only" (gray cloud) initially so Caddy can get SSL certificates.

---

## Step 4: Start the Server

Enable and start the systemd service:

```bash
sudo cp /home/deploy/deploy/config/deploy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable deploy
sudo systemctl start deploy
```

Check it's running:

```bash
sudo systemctl status deploy
```

---

## Step 5: Access the Dashboard

SSH to your server on the configured port (default 2222):

```bash
ssh yourdomain.com -p 2222
```

You'll see a welcome message with a login URL:

```
╔══════════════════════════════════════════╗
║         Welcome to Deploy                ║
╚══════════════════════════════════════════╝

Dashboard: https://admin.yourdomain.com?token=abc123def456...

This link is valid for 7 days.
```

Open that URL in your browser. The token authenticates you and sets a session cookie.

---

## Step 6: Deploy Your First Site

In the dashboard:

1. Click **+ New Site**
2. Paste a Git URL (e.g., `https://github.com/you/your-site.git`)
3. Choose a subdomain (auto-suggested from repo name)
4. Click **Create Site**

Deploy will:
1. Clone your repository
2. Detect the language/framework via Railpack
3. Build a Docker image
4. Start a container
5. Configure Caddy to route traffic

Watch the build logs in real-time. When it's done, your site is live at `https://your-site.yourdomain.com`.

---

## What's Next?

### Site Settings

Click on any site to access:
- **Build Logs** — See what happened during deployment
- **Runtime Logs** — See application output
- **Environment** — Set environment variables
- **Settings** — Toggle visibility, autodeploy, persistent storage

### Enable Autodeploy

In site settings, toggle **Autodeploy** to automatically redeploy when you push to GitHub. This creates a webhook on your repository.

### Add More Sites

Just click **+ New Site** again. Each site gets its own subdomain and SSL certificate automatically.

---

## Troubleshooting

### Can't access dashboard

1. Check the server is running: `sudo systemctl status deploy`
2. Check your SSH key is in `data/authorized_keys`
3. Check firewall allows port 2222: `sudo ufw status`

### Site not loading

1. Check DNS is pointing correctly: `nslookup yoursite.yourdomain.com`
2. Check the site status in the dashboard
3. Check build logs for errors

### Build failed

1. Check build logs in the dashboard
2. Make sure your project has the right files for detection (package.json, Gemfile, etc.)
3. Try adding a `railpack.json` to customize the build

### Logs

```bash
# Deploy server logs
sudo journalctl -u deploy -f

# Caddy logs
sudo journalctl -u caddy -f

# Site container logs
docker logs deploy-sitename
```

---

## Related Documentation

- [Custom Domains](custom-domains.md) — Using your own domains per site
- [Persistent Storage](persistent-storage.md) — Data that survives redeploys
- [Actions](actions/index.md) — Scheduled tasks and webhooks
- [Deployment Guide](DEPLOYMENT.md) — Advanced production setup
