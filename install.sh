#!/bin/bash
# install.sh - One-command installation script for Dial Up Deploy
# Usage: curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/install.sh | bash

set -e

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Log functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
  echo -e "\n${CYAN}==> $1${NC}"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  log_warning "This script should be run with sudo or as root."
  log_info "Trying to continue anyway, but you may need to enter your password for sudo commands."
fi

# Check if we're on Ubuntu
if [ ! -f /etc/os-release ] || ! grep -q "Ubuntu" /etc/os-release; then
  log_warning "This script is designed for Ubuntu. Your system may not be fully compatible."
  log_info "Continuing anyway, but you may encounter issues."
fi

# Install required dependencies
log_step "Installing required dependencies..."
apt-get update
apt-get install -y curl git sudo unzip

# Check if Bun is installed
log_step "Checking for Bun..."
if ! command -v bun &> /dev/null; then
  log_info "Bun not found. Installing..."
  curl -fsSL https://bun.sh/install | bash
  # Add Bun to PATH for this script
  export PATH=$HOME/.bun/bin:$PATH
  source $HOME/.bashrc
  log_success "Bun installed successfully."
else
  log_success "Bun is already installed."
fi

# Get domain from command line or use IP address
log_step "Setting up your domain..."
if [ -n "$1" ]; then
  DOMAIN="$1"
  log_info "Using provided domain: $DOMAIN"
else
  # If no domain provided, try to get the server's IP address
  IP_ADDRESS=$(curl -s https://api.ipify.org)
  if [ -n "$IP_ADDRESS" ]; then
    DOMAIN="$IP_ADDRESS.nip.io"
    log_info "No domain provided. Using IP-based domain: $DOMAIN"
    log_info "You can update this later by editing the .env file and running the caddyfile update command."
  else
    log_error "Could not determine IP address and no domain provided."
    log_info "Usage: curl -fsSL https://raw.githubusercontent.com/keithk/deploy/main/install.sh | sudo bash -s yourdomain.com youremail@example.com"
    exit 1
  fi
fi

# Get email from command line or use default
if [ -n "$2" ]; then
  EMAIL="$2"
  log_info "Using provided email: $EMAIL"
else
  EMAIL="admin@$DOMAIN"
  log_info "Using default email: $EMAIL"
fi

# Install the CLI globally
log_step "Installing DialUpDeploy CLI..."
INSTALL_DIR="/opt/dialup-deploy"

# Create the installation directory
if [ -d "$INSTALL_DIR" ]; then
  log_warning "Directory $INSTALL_DIR already exists."
  read -p "Do you want to remove it and continue? (y/n): " REMOVE_DIR
  if [ "$REMOVE_DIR" = "y" ] || [ "$REMOVE_DIR" = "Y" ]; then
    rm -rf "$INSTALL_DIR"
  else
    log_error "Installation aborted."
    exit 1
  fi
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Install the CLI globally
log_info "Installing CLI globally..."
bun install -g @keithk/deploy-cli
log_success "CLI installed globally."

# Initialize a new project
log_step "Initializing a new project..."
deploy init --force "$INSTALL_DIR"

# Create .env file
log_step "Creating .env file..."
cat > .env << EOF
# Project domain for production
PROJECT_DOMAIN=$DOMAIN
ROOT_DIR=$INSTALL_DIR/sites
PORT=3000
EMAIL=$EMAIL
EOF
log_success ".env file created."

# Run the production setup
log_step "Running production setup..."
deploy setup:production
log_success "Production setup completed."

# Display final instructions
log_step "Installation completed successfully!"
log_info "Your DialUpDeploy server is now set up at https://$DOMAIN"
log_info "Your sites should be accessible at:"
log_info "- https://$DOMAIN (default site)"
log_info "- etc."

log_info "\nDNS Configuration Reminder:"
log_info "1. Set up an A record for your root domain pointing to this server's IP"
log_info "2. Set up a wildcard CNAME record (*.$DOMAIN) pointing to your root domain"

log_info "\nTo manage your application:"
log_info "- Start: sudo systemctl start dialup-deploy"
log_info "- Stop: sudo systemctl stop dialup-deploy"
log_info "- Restart: sudo systemctl restart dialup-deploy"
log_info "- View logs: sudo journalctl -u dialup-deploy"

log_info "\nTo update your domain in the future:"
log_info "1. Edit the .env file in $INSTALL_DIR and update PROJECT_DOMAIN=$DOMAIN to your new domain"
log_info "2. Run: deploy caddyfile update"
log_info "3. Restart the application: sudo systemctl restart dialup-deploy"

log_info "\nRemember to update your DNS settings for the new domain as well!"
