#!/bin/bash

echo "🚀 Quick build (no type checking)..."

# Clean dist
rm -rf dist

# Build CLI entry
echo "📦 Building CLI..."
bun build src/cli/index.ts --outfile dist/cli/index.js --target bun --minify

# Build server entry  
echo "📦 Building server..."
bun build src/server/index.ts --outfile dist/server/index.js --target bun --minify

# Make CLI executable
chmod +x dist/cli/index.js

echo "✅ Build complete!"