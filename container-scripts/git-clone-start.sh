#!/bin/bash
# Git-aware container startup script for Deploy
# This script handles cloning from Git service or using local files

set -e

echo "🚀 Deploy container starting..."

# Install mise if not already present
if ! command -v mise &> /dev/null; then
  echo "📦 Installing mise for unified runtime management..."
  # Download and install mise
  curl https://mise.jdx.dev/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  # Verify installation
  if command -v mise &> /dev/null; then
    echo "   ✅ Mise installed successfully"
  else
    echo "   ⚠️  Mise installation failed, falling back to traditional detection"
  fi
else
  echo "   ✅ Mise already available"
fi

# Check if this container should use Git integration
if [ -n "$GIT_CLONE_URL" ] && [ -n "$GIT_BRANCH" ]; then
  echo "📋 Git integration enabled"
  echo "   Clone URL: $GIT_CLONE_URL"
  echo "   Branch: $GIT_BRANCH"
  
  # Ensure we have git
  if ! command -v git &> /dev/null; then
    echo "❌ Git not found in container. Please install git in your Dockerfile."
    exit 1
  fi
  
  echo "📥 Cloning from Git service..."
  
  # Clone the specific branch
  git clone --branch "$GIT_BRANCH" --single-branch --depth 1 "$GIT_CLONE_URL" /app/src
  
  if [ $? -eq 0 ]; then
    echo "✅ Git clone successful"
    cd /app/src
  else
    echo "❌ Git clone failed"
    exit 1
  fi
  
  # Verify we have the expected files
  if [ ! -f "package.json" ]; then
    echo "⚠️  No package.json found in cloned repository"
  fi
  
else
  echo "📁 Using local files (no Git integration)"
  # Default behavior - assume app files are already mounted/copied
  if [ -d "/app" ]; then
    cd /app
  else
    echo "❌ No /app directory found"
    exit 1
  fi
fi

echo "📦 Installing dependencies..."

# Check if we need to force reinstall dependencies
if [ "$FORCE_REINSTALL" = "true" ]; then
  echo "   🔄 Force reinstalling dependencies..."
  # Remove existing node_modules and lock files for fresh install
  rm -rf node_modules
  if [ -f "package-lock.json" ]; then
    echo "   Removing package-lock.json for fresh install"
    rm package-lock.json
  fi
fi

# Try different package managers
if [ -f "package.json" ]; then
  if [ -f "bun.lockb" ] || command -v bun &> /dev/null; then
    echo "   Using bun..."
    if [ "$FORCE_REINSTALL" = "true" ]; then
      bun install --force
    else
      bun install
    fi
  elif [ -f "pnpm-lock.yaml" ] || command -v pnpm &> /dev/null; then
    echo "   Using pnpm..."
    if [ "$FORCE_REINSTALL" = "true" ]; then
      pnpm install --force
    else
      pnpm install
    fi
  elif [ -f "yarn.lock" ] || command -v yarn &> /dev/null; then
    echo "   Using yarn..."
    if [ "$FORCE_REINSTALL" = "true" ]; then
      yarn install --force
    else
      yarn install
    fi
  else
    echo "   Using npm..."
    if [ "$FORCE_REINSTALL" = "true" ]; then
      npm ci
    else
      npm install
    fi
  fi
else
  echo "   No package.json found, skipping dependency installation"
fi

echo "🎯 Starting dev server..."

# Check for mise configuration first
if [ -f ".mise.toml" ] && command -v mise &> /dev/null; then
  echo "🔧 Mise configuration detected - using unified runtime management"
  
  # List available tasks for debugging
  echo "   Available mise tasks:"
  mise tasks --no-header 2>/dev/null | head -5 || echo "   (no tasks configured)"
  
  # Try to run dev task, fallback to start, then default
  if mise tasks --no-header 2>/dev/null | grep -q "^dev "; then
    echo "   Running: mise run dev"
    exec mise run dev
  elif mise tasks --no-header 2>/dev/null | grep -q "^start "; then
    echo "   Running: mise run start"
    exec mise run start
  else
    echo "   No dev/start tasks found, falling back to package.json detection"
  fi
fi

# Fallback to traditional package.json detection
echo "📦 Using traditional package manager detection"

# Try to determine the start command
if [ -f "package.json" ]; then
  # Check for Vite project and configure accordingly
  if [ "$IS_VITE_PROJECT" = "true" ]; then
    echo "🔥 Vite project detected - configuring for hot reload"
    
    # Export Vite environment variables for hot reload
    export VITE_HOST="${VITE_HOST:-0.0.0.0}"
    export VITE_PORT="${VITE_PORT:-3000}"
    export VITE_WEBSOCKET_PORT="${VITE_WEBSOCKET_PORT:-24678}"
    
    echo "   Vite configuration:"
    echo "     Host: $VITE_HOST"
    echo "     Port: $VITE_PORT"
    echo "     WebSocket Port: $VITE_WEBSOCKET_PORT"
  fi
  
  # Check for common dev commands
  if [ -f "bun.lockb" ] || command -v bun &> /dev/null; then
    if grep -q '"dev"' package.json; then
      if [ "$IS_VITE_PROJECT" = "true" ]; then
        echo "   Running: bun run dev --host $VITE_HOST --port $VITE_PORT"
        exec bun run dev --host "$VITE_HOST" --port "$VITE_PORT"
      else
        echo "   Running: bun run dev --host 0.0.0.0 --port 3000"
        exec bun run dev --host 0.0.0.0 --port 3000
      fi
    elif grep -q '"start"' package.json; then
      echo "   Running: bun run start"
      exec bun run start
    else
      echo "   Running: bun run index.ts"
      exec bun run index.ts
    fi
  else
    if grep -q '"dev"' package.json; then
      if [ "$IS_VITE_PROJECT" = "true" ]; then
        echo "   Running: npm run dev (Vite mode)"
        exec npm run dev
      else
        echo "   Running: npm run dev"
        exec npm run dev
      fi
    elif grep -q '"start"' package.json; then
      echo "   Running: npm run start"
      exec npm start
    else
      echo "   Running: node index.js"
      exec node index.js
    fi
  fi
else
  # No package.json, try to find an entry point
  if [ -f "index.ts" ]; then
    echo "   Running: bun run index.ts"
    exec bun run index.ts
  elif [ -f "index.js" ]; then
    echo "   Running: node index.js"
    exec node index.js
  elif [ -f "server.js" ]; then
    echo "   Running: node server.js"
    exec node server.js
  else
    echo "❌ No obvious entry point found. Please specify a start command."
    exit 1
  fi
fi