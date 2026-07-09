#!/bin/bash
# ABOUTME: Zero-downtime rolling deploy — pulls, builds, and restarts each server
# ABOUTME: instance one at a time behind a health gate so the site stays up.
#
# Invoked by the running server (as the `deploy` user) from the Settings ->
# System Updates action, or manually. It must therefore work WITHOUT being root:
# builds run directly as the invoking user (who owns the deploy dir), and only
# the systemctl restarts use sudo — which the deploy user is granted
# passwordlessly for exactly these units (see /etc/sudoers.d/deploy-rolling).

set -euo pipefail

DEPLOY_DIR="/home/deploy/deploy"
BRANCH="${1:-main}"

# instance service name -> health port. The non-templated `deploy` service is
# instance 0 (port 3000); `deploy@1` is instance 1 (port 3001). Restarting them
# one at a time keeps at least one instance serving traffic throughout.
INSTANCES=("deploy:3000" "deploy@1:3001")

MAX_RETRIES=30
RETRY_INTERVAL=2

check_health() {
  local port=$1 retries=0
  while [ "$retries" -lt "$MAX_RETRIES" ]; do
    if curl -sf "http://localhost:${port}/health" >/dev/null 2>&1; then
      return 0
    fi
    retries=$((retries + 1))
    sleep "$RETRY_INTERVAL"
  done
  return 1
}

echo "=== Rolling Deploy Started ==="
cd "$DEPLOY_DIR"

echo "Pulling latest code from $BRANCH..."
git pull origin "$BRANCH"

echo "Installing dependencies..."
bun install

echo "Building..."
bun run build

for entry in "${INSTANCES[@]}"; do
  svc="${entry%%:*}"
  port="${entry##*:}"
  echo "Restarting ${svc}..."
  sudo systemctl restart "$svc"
  echo "Waiting for ${svc} (port ${port}) to be healthy..."
  if check_health "$port"; then
    echo "${svc} is healthy"
  else
    echo "ERROR: ${svc} failed health check on port ${port}"
    exit 1
  fi
done

echo "=== Rolling Deploy Complete ==="
