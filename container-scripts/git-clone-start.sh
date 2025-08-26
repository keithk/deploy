#!/bin/bash
# Git-aware container startup script for Deploy
# This script handles cloning from Git service or using local files

set -e

echo "🚀 Deploy container starting..."

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

# Try different package managers
if [ -f "package.json" ]; then
  if [ -f "bun.lockb" ] || command -v bun &> /dev/null; then
    echo "   Using bun..."
    bun install
  elif [ -f "pnpm-lock.yaml" ] || command -v pnpm &> /dev/null; then
    echo "   Using pnpm..."
    pnpm install
  elif [ -f "yarn.lock" ] || command -v yarn &> /dev/null; then
    echo "   Using yarn..."
    yarn install
  else
    echo "   Using npm..."
    npm install
  fi
else
  echo "   No package.json found, skipping dependency installation"
fi

echo "🎯 Starting dev server..."

# Try to determine the start command
if [ -f "package.json" ]; then
  # Check for common dev commands
  if [ -f "bun.lockb" ] || command -v bun &> /dev/null; then
    if grep -q '"dev"' package.json; then
      echo "   Running: bun run dev --host 0.0.0.0 --port 3000"
      exec bun run dev --host 0.0.0.0 --port 3000
    elif grep -q '"start"' package.json; then
      echo "   Running: bun run start"
      exec bun run start
    else
      echo "   Running: bun run index.ts"
      exec bun run index.ts
    fi
  else
    if grep -q '"dev"' package.json; then
      echo "   Running: npm run dev"
      exec npm run dev
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