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
deploy dev
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

### Option 1: Clone from GitHub (Recommended!)

1. **Clone your repo**: `git clone https://github.com/yourusername/your-site.git sites/your-site`
2. **Add config**: `echo '{"type": "static"}' > sites/your-site/config.json`
3. **Go live**: Your site is instantly available at `your-site.yourdomain.com`

### Option 2: Create from scratch

1. Make a new folder in `sites` (name it whatever you want)
2. Add a `config.json` file with your configuration
3. Add your website files

That's it! Your site is live with its own subdomain and SSL certificate.

### 🚀 Pro Tip: Git-powered deployments

Once your site is cloned from GitHub:
- **Update**: `cd sites/your-site && git pull` (changes are live instantly)
- **Rollback**: `git checkout previous-commit` (instant rollbacks)
- **Branches**: Switch branches to test different versions
- **Automation**: Set up webhooks to auto-deploy on push

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
   deploy restart
   ```
4. Update your DNS settings for the new domain
