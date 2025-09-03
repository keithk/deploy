# Deploy: Universal Deployment Made Simple

## 🚀 What is Deploy?

Deploy is a deployment tool that works with ANY type of website or application. Whether you're deploying a static HTML site, a complex Ruby on Rails application, a Python Django project, a Go microservice, or a Rust web app - Deploy understands and deploys it instantly.

## Quick Installation

### One-Command Server Setup (Ubuntu/DigitalOcean)

```bash
# Install with default IP-based domain
curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/install.sh | sudo bash

# Optional: Install with your custom domain and email
curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/install.sh | sudo bash -s yourdomain.com your@email.com
```

### Manual Installation (macOS/Linux)

```bash
# Prerequisites: Install Bun (https://bun.sh)
git clone https://github.com/keithk/deploy.git
cd deploy
bun install
bun run setup:macos   # Use appropriate OS setup
bun run build
```

## 🌐 Deploying Your First Site

Deploy makes deployment brain-dead simple. Just three steps:

### Option 1: Clone from Git (Recommended)

```bash
# Clone your project
git clone https://github.com/yourusername/your-project.git sites/your-project

# That's it! Your site is live
# Accessible at: your-project.youردomain.com
```

### Option 2: Create from Scratch

```bash
# Create a new site directory
mkdir -p sites/my-awesome-site

# Add your project files
# No complex configuration needed!
```

## 🔧 Universal Deployment Magic

Deploy uses intelligent Railpacks to automatically:
- Detect your project type
- Generate the perfect Docker container
- Configure optimal build and runtime settings
- Set up SSL certificates
- Create subdomains

### Supported Technologies (Just a Few!)
- Static Sites (HTML/CSS/JS)
- React, Vue, Angular, Svelte
- Next.js, Nuxt, SvelteKit
- Ruby on Rails
- Django, Flask
- Express.js, Fastify
- Go web apps
- Rust web services
- PHP applications
- ... and basically ANYTHING else!

## 🚢 Development vs Production

```bash
# Development Mode
bun run dev       # Start local development
deploy dev

# Production Mode
bun run build     # Optional build step
deploy start
```

## 💡 Pro Tips

- No configuration required for most projects
- Automatic SSL with Let's Encrypt
- Git-powered deployments
- Instant rollbacks
- Webhook support for automated deployments

## Minimum Requirements

- [Bun](https://bun.sh) runtime
- Docker
- Git
- Caddy (automatically installed)

## Quick Troubleshooting

1. Ensure Bun is installed: `bun --version`
2. Check Docker is running: `docker ps`
3. Verify Deploy installation: `deploy --version`

Enjoy effortless deployments!
