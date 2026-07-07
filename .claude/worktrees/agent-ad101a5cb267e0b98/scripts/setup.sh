#!/bin/bash
# ABOUTME: Bootstrap script for deploying Deploy on fresh Ubuntu servers.
# ABOUTME: Installs Bun, Docker, Caddy, Railpack and prepares the environment.

# Deploy - Server Setup
# Run: curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/scripts/setup.sh | sudo bash

set -e

echo "+==============================================================+"
echo "|                    Deploy - Server Setup                      |"
echo "+==============================================================+"
echo ""

# Check if root
if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root (sudo)"
  exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
else
    echo "Error: Cannot detect OS. This script requires Ubuntu."
    exit 1
fi

if [[ "$OS" != *"Ubuntu"* ]]; then
    echo "Warning: This script is optimized for Ubuntu. Proceeding anyway..."
fi

echo "Detected: $OS $VER"
echo ""

# Update system
echo "==> Updating system packages..."
apt-get update
apt-get upgrade -y

# Install basic dependencies
echo "==> Installing basic dependencies..."
apt-get install -y \
    curl \
    unzip \
    git \
    build-essential \
    ca-certificates \
    gnupg \
    lsb-release

# Install Bun
echo "==> Installing Bun..."
if command -v bun &> /dev/null; then
    echo "Bun is already installed"
    bun --version
else
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    # Also add to .bashrc for future sessions
    echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
    echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
fi

# Install Docker
echo "==> Installing Docker..."
if command -v docker &> /dev/null; then
    echo "Docker is already installed"
    docker --version
else
    # Remove old versions
    apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

    # Add Docker's official GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # Add the repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Enable and start Docker
    systemctl enable docker
    systemctl start docker
fi

# Install Caddy
echo "==> Installing Caddy..."
if command -v caddy &> /dev/null; then
    echo "Caddy is already installed"
    caddy version
else
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy

    # Stop Caddy from running as a service - we'll manage it ourselves
    systemctl stop caddy 2>/dev/null || true
    systemctl disable caddy 2>/dev/null || true
fi

# Install Railpack (for building container images)
echo "==> Installing Railpack..."
if command -v railpack &> /dev/null; then
    echo "Railpack is already installed"
else
    curl -fsSL https://railpack.dev/install.sh | bash
fi

# Create deploy user
echo "==> Setting up deploy user..."
if id "deploy" &>/dev/null; then
    echo "User 'deploy' already exists"
else
    useradd -m -s /bin/bash deploy
    echo "Created user 'deploy'"
fi

# Add deploy user to docker group
usermod -aG docker deploy

# Create deployment directory
echo "==> Creating deployment directory..."
DEPLOY_DIR="/home/deploy/deploy"
if [ -d "$DEPLOY_DIR" ]; then
    echo "Deploy directory already exists at $DEPLOY_DIR"
else
    mkdir -p "$DEPLOY_DIR"
    chown deploy:deploy "$DEPLOY_DIR"
fi

# Create sites directory
echo "==> Creating sites directory..."
SITES_DIR="/var/deploy/sites"
mkdir -p "$SITES_DIR"
chown deploy:deploy "$SITES_DIR"

# Create Caddy log directory
echo "==> Creating Caddy log directory..."
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy 2>/dev/null || chown deploy:deploy /var/log/caddy

# Configure firewall
echo "==> Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow ssh
    ufw allow http
    ufw allow https
    ufw allow 2222/tcp  # SSH for deploy

    # Enable firewall if not already enabled
    if ! ufw status | grep -q "Status: active"; then
        echo "y" | ufw enable
    fi

    ufw status
else
    echo "UFW not found, skipping firewall configuration"
fi

# Clone repository
echo "==> Cloning Deploy repository..."
cd /home/deploy
if [ -d "$DEPLOY_DIR/.git" ]; then
    echo "Repository already cloned, pulling latest..."
    sudo -u deploy git -C "$DEPLOY_DIR" pull
else
    sudo -u deploy git clone https://github.com/keithk/deploy.git "$DEPLOY_DIR"
fi

# Install dependencies and build
echo "==> Installing dependencies..."
cd "$DEPLOY_DIR"
sudo -u deploy /root/.bun/bin/bun install

echo "==> Building project..."
sudo -u deploy /root/.bun/bin/bun run build

# Copy Bun to deploy user
echo "==> Setting up Bun for deploy user..."
sudo -u deploy mkdir -p /home/deploy/.bun/bin
cp /root/.bun/bin/bun /home/deploy/.bun/bin/
chown -R deploy:deploy /home/deploy/.bun

# Add Bun to deploy user's PATH
sudo -u deploy bash -c 'echo "export BUN_INSTALL=\"\$HOME/.bun\"" >> ~/.bashrc'
sudo -u deploy bash -c 'echo "export PATH=\"\$BUN_INSTALL/bin:\$PATH\"" >> ~/.bashrc'

echo ""
echo "+==============================================================+"
echo "|              Base installation complete!                      |"
echo "+==============================================================+"
echo ""
echo "Next steps:"
echo "  1. cd $DEPLOY_DIR"
echo "  2. sudo -u deploy /home/deploy/.bun/bin/bun run deploy setup"
echo "  3. Follow the interactive setup wizard"
echo ""
echo "After setup, you can start the server with:"
echo "  sudo systemctl start deploy"
echo ""
echo "Or manually:"
echo "  cd $DEPLOY_DIR && sudo -u deploy /home/deploy/.bun/bin/bun run start"
echo ""
