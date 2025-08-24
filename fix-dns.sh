#!/bin/bash
# DNS Setup Script for keith.deploy domain
# This script requires sudo access

echo "Setting up DNS resolution for keith.deploy domain..."

# Add dnsmasq configuration for keith.deploy domain
echo "Adding dnsmasq configuration..."
echo "address=/.keith.deploy/127.0.0.1" | sudo tee -a /opt/homebrew/etc/dnsmasq.conf

# Create resolver directory if it doesn't exist
echo "Creating resolver directory..."
sudo mkdir -p /etc/resolver

# Create resolver file for keith.deploy domain
echo "Creating resolver configuration..."
echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/keith.deploy

# Start dnsmasq service
echo "Starting dnsmasq service..."
sudo brew services start dnsmasq

echo "DNS setup completed!"
echo ""
echo "Testing DNS resolution..."
nslookup keith.deploy
echo ""
echo "If the above shows 127.0.0.1, DNS is working correctly."
echo "You should now be able to access https://keith.deploy"