# 🚀 Deploy

**A simple way to deploy websites with automatic SSL and subdomains, built for community hosting**

Built with Bun runtime and designed for static sites, Astro, Next.js, and custom TypeScript applications. This project was born from experience building Glitch - I needed a simple place to host all my sites and my friends' sites.

## Architecture Philosophy

### Core Principles
- **Simplicity over complexity**: No microservices, no orchestration complexity
- **Community scale**: Optimized for 6-12 friends sharing resources
- **Single server**: Everything runs on one medium VPS server
- **Self-service focus**: Users can create and edit sites independently
- **Web-first**: Browser-based editing with optional CLI for power users

### What We Avoid
- ❌ Kubernetes or complex orchestration
- ❌ Multiple databases or data stores
- ❌ Separate authentication services
- ❌ Complex organization hierarchies
- ❌ Enterprise-grade monitoring stacks

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
- ✅ Built-in admin panel at `admin.yourdomain.com`
- ✅ Code editor at `editor.yourdomain.com`

## 🛠️ Local Development Setup

For development, Deploy automatically installs and configures all required tools:

```bash
# Clone and set up for development
git clone https://github.com/dialupdotcom/deploy.git
cd deploy
bun install

# Automated setup - installs Docker, Railpacks, Mise, Caddy
bun run deploy setup

# Check that everything works
bun run deploy doctor

# Start development server
bun run dev
```

**Tools installed automatically:**
- 🐳 **Docker** - Container runtime for deployments
- 📦 **Railpacks** - Automatic containerization 
- ⚙️ **Mise** - Runtime manager
- 🌐 **Caddy** - Web server with automatic HTTPS
- 🔒 **Local SSL** - Trusted certificates for development

**What the setup does:**
- Installs missing dependencies
- Configures local DNS (macOS)
- Generates SSL certificates
- Sets up reverse proxy
- Verifies everything works

**Troubleshooting:**
```bash
deploy doctor    # Diagnose issues
deploy doctor -v # Get fix commands
```

## 📁 Add your first site

```bash
# Go to your sites folder
cd /opt/deploy/sites

# Create a new site (just make a folder!)
mkdir my-awesome-site
echo "<h1>Hello World!</h1>" > my-awesome-site/index.html

# That's it! Live at my-awesome-site.yourdomain.com
# (Deploy automatically detects and serves new sites)
```

### Or clone from GitHub

```bash
# Go to your sites folder
cd /opt/deploy/sites

# Clone any repo
git clone https://github.com/yourusername/blog.git

# Live at blog.yourdomain.com!
```

---

## 📦 Installation

### NPM Installation (Single Package!)

```bash
npm install -g @keithk/deploy
```

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/keithk/deploy.git
cd deploy

# Install dependencies
bun install

# Build the project
bun run build

# Start the server
./dist/cli/index.js start
```

---

## 🎛️ Admin Panel Management

The admin panel is built-in and accessible at `admin.yourdomain.com`:

### Enable/Disable Admin Panel
```bash
# Check admin panel status
deploy admin status

# Enable the admin panel
deploy admin enable

# Disable the admin panel
deploy admin disable
```

### Reset Admin Password
```bash
# Reset password for admin user
deploy admin reset-password

# You'll be prompted for:
# - Admin username (default: admin)
# - New password
# - Password confirmation
```

If the admin user doesn't exist, you'll be offered to create one.

---

## 🎯 Commands

### Main Commands

```bash
# Start the server
deploy start

# Development mode (auto-reload)
deploy dev

# Setup server (local or production)
deploy setup local      # Sets up local development with SSL
deploy setup production # Configures for production deployment

# Check system health and diagnose issues
deploy doctor          # Comprehensive system check
deploy doctor -v       # Verbose output with fix commands

# Admin panel management
deploy admin status
deploy admin enable
deploy admin disable
deploy admin reset-password

# Site management
deploy site list
deploy site add <name>
deploy site remove <name>

# Process management
deploy processes list
deploy processes start <name>
deploy processes stop <name>
```

---

## 🏗️ Project Structure

After consolidation, this is now a single package with the following structure:

```
src/
├── cli/          # CLI commands and utilities
├── server/       # Server components
├── core/         # Shared utilities and types
├── actions/      # Action utilities
├── admin/        # Built-in admin panel
└── editor/       # Built-in code editor
```

### Import Paths

When creating custom actions or extending the system:

```typescript
// Everything is now imported from the single package
import { 
  SiteConfig, 
  LogLevel,
  startServer,
  buildSite,
  defineScheduledAction 
} from '@keithk/deploy';
```

---

## 🛠️ Configuration

### Environment Variables

```bash
# Server configuration
PORT=3000
HOST=0.0.0.0
ROOT_DIR=/opt/deploy/sites

# Admin configuration
ADMIN_DISABLED=false
DATA_DIR=/opt/deploy/data

# Development
NODE_ENV=development
LOG_LEVEL=info
```

### Site Configuration

Each site can have a `site.json` file:

```json
{
  "name": "my-site",
  "type": "static",
  "subdomain": "custom-subdomain",
  "port": 8080,
  "build": {
    "command": "npm run build",
    "outputDir": "dist"
  }
}
```

---

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       VPS Server                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Caddy Proxy                         ││
│  │           (SSL + Routing + Rate Limiting)              ││
│  └─────────────────────────────────────────────────────────┘│
│                            │                                │
│  ┌─────────────────────────┼─────────────────────────────┐ │
│  │   Admin Panel    │  Code Editor    │   User Sites    │ │
│  │  (Port 3001)     │  (Port 3002)    │   (Port 8000+)  │ │
│  └─────────────────────────┼─────────────────────────────┘ │
│                            │                                │
│  ┌─────────────────────────┼─────────────────────────────┐ │
│  │              SQLite/Custom Database                    │ │
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Development

### Building from Source

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Run in development mode
bun run dev

# Type checking
bun run typecheck
```

### Creating Custom Actions

Actions are modular components that handle specific deployment tasks. Create a new action in `src/actions/`:

```typescript
import { ActionContext, ActionResult } from '@keithk/deploy';

export async function myCustomAction(
  context: ActionContext
): Promise<ActionResult> {
  // Your action logic here
  return {
    success: true,
    message: 'Action completed'
  };
}
```

---

## 🤝 Contributing

This is primarily a personal project, but feel free to:

- Open issues for bugs or feature requests
- Submit PRs for improvements
- Fork it and make it your own!

There are no tests because this is my personal tool that I'm sharing. Take it, fork it, build a user system on top and host sites for your friends. Add fediverse webhooks and turn it into a social network. Do whatever!

---

## 📄 License

MIT - Do whatever you want with it!

---

## 🚦 Success Criteria

### Technical Goals
- **Setup time**: Complete setup in under 10 minutes
- **Response time**: All sites respond in under 2 seconds  
- **Resource efficiency**: Support 8+ users on medium VPS server
- **Reliability**: 99%+ uptime for hosted sites

### User Experience Goals
- **Admin onboarding**: Admin can manage users in under 5 minutes
- **User onboarding**: Users can deploy first site in under 3 minutes
- **Transparency**: Users understand resource limits clearly
- **Community feel**: Designed for friends helping friends host sites

---

Built with ❤️ for community hosting