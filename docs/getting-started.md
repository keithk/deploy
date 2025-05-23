# Getting Started

## 🚀 One-Command Install (Ubuntu/DigitalOcean)

Spin up a new server and run:

```bash
curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/install.sh | sudo bash
```

Or, with your own domain and email:

```bash
curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/install.sh | sudo bash -s yourdomain.com your@email.com
```

This script will:

1. Install all dependencies (Bun, Caddy, unzip, etc.)
2. Clone the repository
3. Set up Caddy with wildcard SSL (no manual certs, ever)
4. Configure the server to run on startup

If you don't specify a domain, the script uses your server's IP with nip.io (e.g., 123.45.67.89.nip.io). You can update it later.

---

## 🧰 Prerequisites (for manual setup)

- [Bun](https://bun.sh/) — Fast JS runtime, bundler, test runner, package manager
- [Caddy](https://caddyserver.com/) — For automatic HTTPS

---

## 🛠️ Manual Installation

```bash
git clone https://github.com/keithk/deploy.git
cd deploy
bun install
bun run setup:macos   # or your OS
bun run build
```

---

## 🏗️ Development

```bash
# Using the CLI
deploy setup local
deploy start
```

---

## 🚢 Production

```bash
# Using the CLI
deploy setup production
deploy start
```

---

## 💫 Adding a New Site (3 Steps!)

1. Make a new folder in `sites` (name it whatever you want)
2. Add a `config.json` file with your configuration
3. Restart the server with `deploy start`

That's it! Your site is live with its own subdomain and SSL certificate.

---

## 🧪 Development-Only Sites

- Create a folder in `sites` that starts with an underscore (e.g., `_dev-site`)
- Add your `config.json` and site files as usual
- The site will be available in development mode (`deploy start`) but excluded in production

---

## 🌐 Updating Your Domain

1. Edit `.env` and update `PROJECT_DOMAIN=yourdomain.com`
2. Update your Caddyfile:
   ```bash
   deploy caddyfile update
   ```
3. Restart the app:
   ```bash
   sudo systemctl restart dialup-deploy
   ```
4. Update your DNS settings for the new domain
