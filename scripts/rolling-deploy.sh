#!/bin/bash
# ABOUTME: Zero-downtime rolling deploy — pulls, builds, and restarts each server
# ABOUTME: instance one at a time behind a health gate so the site stays up.
#
# Invoked by the running server from Settings -> System Updates, launched as a
# transient systemd unit (see performRollingUpdate in api/system.ts) so it runs
# OUTSIDE the deploy service's cgroup — otherwise `systemctl restart deploy`
# below would kill this script mid-run (the units use KillMode=control-group).
# Can also be run directly as the `deploy` user.
#
# Builds run as the invoking user (who owns the deploy dir); only the systemctl
# restarts use sudo, granted passwordlessly for exactly these units in
# /etc/sudoers.d/deploy-service and /etc/sudoers.d/deploy-rolling.

set -euo pipefail

DEPLOY_DIR="/home/deploy/deploy"
BRANCH="${1:-main}"
STATUS_FILE="$DEPLOY_DIR/data/update-status.json"
STARTED_AT="$(date -Iseconds)"

# instance service name -> health port. The non-templated `deploy` service is
# instance 0 (port 3000); `deploy@1` is instance 1 (port 3001). Restarting them
# one at a time keeps at least one instance serving traffic throughout.
INSTANCES=("deploy:3000" "deploy@1:3001")

MAX_RETRIES=30
RETRY_INTERVAL=2

# Publish progress to a shared file the server reads for /api/system/update-status.
# The server restarts mid-run, so in-memory status can't survive — the file can.
write_status() {
  local status="$1" message="$2" completed="${3:-}"
  if [ -n "$completed" ]; then
    printf '{"status":"%s","message":"%s","startedAt":"%s","completedAt":"%s"}\n' \
      "$status" "$message" "$STARTED_AT" "$completed" > "$STATUS_FILE"
  else
    printf '{"status":"%s","message":"%s","startedAt":"%s"}\n' \
      "$status" "$message" "$STARTED_AT" > "$STATUS_FILE"
  fi
}

fail() {
  write_status "error" "$1" "$(date -Iseconds)"
  echo "ERROR: $1" >&2
  exit 1
}
# Any unexpected command failure (git/bun/etc.) reports an error status.
trap 'fail "Rolling deploy failed — see: journalctl -u deploy-rolling"' ERR

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

write_status "updating" "Pulling latest code..."
echo "Pulling latest code from $BRANCH..."
git pull origin "$BRANCH"

write_status "updating" "Installing dependencies..."
echo "Installing dependencies..."
bun install

write_status "updating" "Building..."
echo "Building..."
bun run build

for entry in "${INSTANCES[@]}"; do
  svc="${entry%%:*}"
  port="${entry##*:}"
  write_status "updating" "Restarting ${svc}..."
  echo "Restarting ${svc}..."
  sudo systemctl restart "$svc"
  echo "Waiting for ${svc} (port ${port}) to be healthy..."
  if ! check_health "$port"; then
    fail "${svc} failed health check on port ${port}"
  fi
  echo "${svc} is healthy"
done

write_status "success" "Update completed successfully" "$(date -Iseconds)"
echo "=== Rolling Deploy Complete ==="
