#!/bin/bash

# Directory restructuring script for consolidating packages
# This script moves files from packages/* to a unified src/ structure

set -e

echo "🚀 Starting directory restructuring..."

# Check if we're in the project root
if [ ! -f "package.json" ] || [ ! -d "packages" ]; then
    echo "❌ Error: Must be run from project root (containing package.json and packages/)"
    exit 1
fi

# Create backup
echo "📦 Creating backup..."
BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r packages "$BACKUP_DIR/"
echo "✅ Backup created in $BACKUP_DIR"

# Create new src directory structure
echo "📁 Creating new directory structure..."
mkdir -p src

# Function to move package contents
move_package() {
    local package_name=$1
    local target_dir=$2
    
    if [ -d "packages/$package_name/src" ]; then
        echo "  Moving $package_name to src/$target_dir..."
        
        # Create target directory
        mkdir -p "src/$target_dir"
        
        # Move all contents from package src to target
        if [ -d "packages/$package_name/src" ]; then
            cp -r packages/$package_name/src/* "src/$target_dir/" 2>/dev/null || true
        fi
        
        echo "  ✓ Moved $package_name"
    else
        echo "  ⚠️  Warning: packages/$package_name/src not found"
    fi
}

# Move each package
echo "📋 Moving packages..."
move_package "core" "core"
move_package "actions" "actions"
move_package "server" "server"

# Special handling for CLI (extract admin and editor)
echo "📋 Moving CLI package with special handling..."
if [ -d "packages/cli/src" ]; then
    # Move admin and editor to root level
    if [ -d "packages/cli/src/admin" ]; then
        echo "  Moving admin panel to src/admin..."
        cp -r packages/cli/src/admin src/ 2>/dev/null || true
    fi
    
    if [ -d "packages/cli/src/editor" ]; then
        echo "  Moving editor to src/editor..."
        cp -r packages/cli/src/editor src/ 2>/dev/null || true
    fi
    
    # Move remaining CLI files
    echo "  Moving remaining CLI files to src/cli..."
    mkdir -p src/cli
    
    # Copy everything except admin and editor
    for item in packages/cli/src/*; do
        basename=$(basename "$item")
        if [ "$basename" != "admin" ] && [ "$basename" != "editor" ]; then
            cp -r "$item" src/cli/ 2>/dev/null || true
        fi
    done
    
    echo "  ✓ Moved CLI components"
fi

# Create a mapping file for reference
echo "📝 Creating migration map..."
cat > MIGRATION_MAP.md << EOF
# Package Migration Map

## Directory Structure Changes

### Before:
\`\`\`
packages/
├── cli/src/
│   ├── admin/
│   ├── editor/
│   └── [cli files]
├── server/src/
├── core/src/
└── actions/src/
\`\`\`

### After:
\`\`\`
src/
├── cli/        # CLI commands and utilities
├── server/     # Server components
├── core/       # Shared utilities
├── actions/    # Action utilities
├── admin/      # Admin panel (extracted from cli)
└── editor/     # Code editor (extracted from cli)
\`\`\`

## Import Path Changes

- \`@keithk/deploy-core\` → \`../core\` (or appropriate relative path)
- \`@keithk/deploy-server\` → \`../server\`
- \`@keithk/deploy-actions\` → \`../actions\`
- \`@keithk/deploy-cli\` → \`../cli\`

## Backup Location
Backup created at: $BACKUP_DIR

## Next Steps
1. Run transform-imports.js to update all import paths
2. Run merge-packages.js to consolidate package.json files
3. Update tsconfig.json for new structure
4. Test the build process
EOF

echo "✅ Migration map created"

# Count files moved
TOTAL_FILES=$(find src -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" | wc -l)
echo ""
echo "✅ Directory restructuring complete!"
echo "📊 Total files moved: $TOTAL_FILES"
echo ""
echo "Next steps:"
echo "1. Run: node scripts/consolidate/transform-imports.js"
echo "2. Run: node scripts/consolidate/merge-packages.js"
echo "3. Update build configuration"
echo "4. Test the new structure"