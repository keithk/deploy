#!/bin/bash
# ABOUTME: One-command production update — pushes main, then runs the rolling
# ABOUTME: deploy on the droplet. Run from a dev machine: bun run deploy:prod
#
# The droplet pulls from origin, so anything not pushed will not ship. This
# refuses to deploy a dirty tree rather than silently leaving commits behind.

set -euo pipefail

HOST="${DEPLOY_HOST:-root@admin.keith.is}"
BRANCH="${1:-main}"
DEPLOY_DIR="/home/deploy/deploy"

cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty — commit or stash before deploying." >&2
  git status --short >&2
  exit 1
fi

echo "==> Pushing $BRANCH to origin"
git push origin "$BRANCH"

echo "==> Running rolling deploy on $HOST"
ssh "$HOST" "sudo -u deploy bash -lc 'cd $DEPLOY_DIR && ./scripts/rolling-deploy.sh $BRANCH'"

echo "==> Verifying"
ssh "$HOST" "cd $DEPLOY_DIR && git log --oneline -1"
curl -sf -o /dev/null -w "admin.keith.is/health: %{http_code}\n" https://admin.keith.is/health
