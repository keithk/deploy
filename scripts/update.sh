#!/bin/bash
# ABOUTME: Production update script - pulls, builds, and restarts all services.
# ABOUTME: Run as root: ./scripts/update.sh

set -e

DEPLOY_DIR="/home/deploy/deploy"
DEPLOY_USER="deploy"
BRANCH="${1:-main}"

cd "$DEPLOY_DIR"

echo "🔄 Updating Deploy server..."

echo ""
echo "📥 Pulling latest code from $BRANCH..."
sudo -u "$DEPLOY_USER" git pull origin "$BRANCH"

echo ""
echo "📦 Installing dependencies..."
sudo -u "$DEPLOY_USER" bun install

echo ""
echo "🔨 Building..."
sudo -u "$DEPLOY_USER" bun run build

echo ""
echo "🔄 Restarting deploy service..."
systemctl restart deploy

echo ""
echo "⏳ Waiting for deploy service to be ready..."
sleep 5

# Wait for the health endpoint to respond
for i in {1..10}; do
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Deploy service is ready"
    break
  fi
  echo "   Waiting... ($i/10)"
  sleep 1
done

echo ""
echo "🔄 Restarting Caddy..."
systemctl restart caddy

echo ""
echo "⏳ Waiting for Caddy to obtain certificates..."
sleep 3

echo ""
echo "📊 Service status:"
systemctl status deploy --no-pager -l | head -15

echo ""
echo "🎉 Update complete!"
