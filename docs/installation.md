# Deploy Installation Guide

This guide will help you get Deploy up and running with all required dependencies for a smooth development experience.

## Quick Start

The easiest way to get started is with the automated setup:

```bash
# Clone the repository
git clone https://github.com/dialupdotcom/deploy.git
cd deploy

# Install dependencies 
bun install

# Run the setup (installs all required tools)
bun run deploy setup

# Check that everything is working
bun run deploy doctor

# Start development server
bun run dev
```

## System Requirements

Deploy requires the following tools to work properly:

### Required Tools
- **Bun** - JavaScript runtime (required)
- **Docker** - Container runtime (required for deployments)

### Optional Tools (installed automatically during setup)
- **Caddy** - Web server and reverse proxy
- **Mise** - Runtime manager (required by Railpacks)
- **Railpacks** - Automatic containerization tool

## Manual Installation

If you prefer to install tools manually or the automated setup fails:

### Install Bun
```bash
curl -fsSL https://bun.sh/install | bash
```

### Install Docker

**macOS:**
```bash
# Install Docker Desktop from https://www.docker.com/products/docker-desktop/
```

**Linux:**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo systemctl start docker
sudo systemctl enable docker
```

### Install Mise
```bash
curl https://mise.run | sh
```

### Install Railpacks
```bash
# Install Rust first (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Railpacks
cargo install railpacks
```

### Install Caddy

**macOS:**
```bash
brew install caddy
```

**Linux:**
```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/setup.deb.sh' | sudo -E bash
sudo apt install caddy
```

## Setup Process

The `deploy setup` command will:

1. **Install missing tools** - Automatically installs Docker, Mise, Railpacks, and Caddy
2. **Configure local DNS** - Sets up dnsmasq on macOS for local domain resolution
3. **Generate SSL certificates** - Creates trusted certificates for HTTPS development
4. **Configure Caddy** - Sets up reverse proxy with SSL
5. **Initialize database** - Creates the Deploy database and admin user
6. **Verify installation** - Checks that all tools are working properly

## Environment Types

### Local Development
```bash
deploy setup local  # or just 'deploy setup'
```

This sets up:
- Local SSL certificates for HTTPS
- DNS resolution for `.dev.flexi` domains
- Development Caddy configuration
- SQLite database

### Production
```bash
deploy setup production
```

This sets up:
- Production Caddy configuration with Let's Encrypt
- Systemd service files
- Firewall configuration
- Production environment variables

## Troubleshooting

### Check System Health
```bash
deploy doctor
```

This command will:
- Check if all required tools are installed
- Verify Docker daemon is running
- Test tool functionality
- Provide fix commands for issues

### Common Issues

**Docker daemon not running:**
- macOS: Start Docker Desktop application
- Linux: `sudo systemctl start docker`

**Permission issues with Docker:**
- Add your user to docker group: `sudo usermod -aG docker $USER`
- Log out and back in

**Local domains not resolving:**
- macOS: `brew services start dnsmasq`
- Check DNS configuration: `dig test.dev.flexi`

**SSL certificate issues:**
- Reinstall certificates: `mkcert -install`
- Clear browser cache and restart

### Getting Help

1. Run `deploy doctor` to diagnose issues
2. Check the logs in `~/.deploy/logs/`
3. Create an issue on GitHub with diagnostic output

## Development Workflow

Once everything is set up:

```bash
# Start development server
bun run dev

# Create a new site
deploy site create my-site

# Build and deploy a site
deploy build my-site
deploy run my-site

# View running processes
deploy processes

# Check system status
deploy doctor
```

## Next Steps

- Read the [Configuration Guide](./configuration.md)
- Explore [Examples](../examples/)
- Learn about [Actions](./actions/)

Deploy is designed to make web deployment simple and fast. The setup process ensures you have everything needed for a smooth development experience!