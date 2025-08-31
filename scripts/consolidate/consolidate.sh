#!/bin/bash

# Master consolidation script
# This script orchestrates the entire package consolidation process

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║          DIALUP DEPLOY PACKAGE CONSOLIDATION              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "This script will consolidate your multi-package structure into"
echo "a single unified package. This is a significant change!"
echo ""
echo "Current structure: packages/{cli,server,core,actions}"
echo "New structure:     src/{cli,server,core,actions,admin,editor}"
echo ""

# Confirmation prompt
read -p "Do you want to proceed? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Consolidation cancelled."
    exit 0
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "STEP 1/5: Directory Restructuring"
echo "════════════════════════════════════════════════════════════"
bash scripts/consolidate/restructure-directories.sh

echo ""
echo "════════════════════════════════════════════════════════════"
echo "STEP 2/5: Transform Imports"
echo "════════════════════════════════════════════════════════════"
node scripts/consolidate/transform-imports.js

echo ""
echo "════════════════════════════════════════════════════════════"
echo "STEP 3/5: Merge Package.json Files"
echo "════════════════════════════════════════════════════════════"
node scripts/consolidate/merge-packages.js

echo ""
echo "════════════════════════════════════════════════════════════"
echo "STEP 4/5: Update TypeScript Configuration"
echo "════════════════════════════════════════════════════════════"
node scripts/consolidate/update-tsconfig.js

echo ""
echo "════════════════════════════════════════════════════════════"
echo "STEP 5/5: Final Steps"
echo "════════════════════════════════════════════════════════════"

# Apply the new package.json
echo "📦 Applying new package.json..."
cp package.json package.original.json
cp package.consolidated.json package.json
echo "✅ Package.json updated (original backed up as package.original.json)"

# Clean and reinstall
echo "🧹 Cleaning node_modules..."
rm -rf node_modules
rm -rf packages/*/node_modules

echo "📦 Installing dependencies..."
bun install

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║               CONSOLIDATION COMPLETE!                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Your project has been successfully consolidated!"
echo ""
echo "📁 New Structure:"
echo "   src/"
echo "   ├── cli/       # CLI commands"
echo "   ├── server/    # Server components"
echo "   ├── core/      # Shared utilities"
echo "   ├── actions/   # Action utilities"
echo "   ├── admin/     # Admin panel"
echo "   └── editor/    # Code editor"
echo ""
echo "📋 Next Steps:"
echo "1. Test the build:     bun run build"
echo "2. Test the CLI:       bun run start"
echo "3. Run tests:          bun test"
echo "4. Review changes:     git diff"
echo "5. Commit when ready:  git add . && git commit -m 'Consolidate packages into single structure'"
echo ""
echo "📝 Documentation:"
echo "   - MIGRATION_MAP.md: Details of the restructuring"
echo "   - CONSOLIDATION_REPORT.md: Package merge report"
echo ""
echo "⚠️  Note: The old structure is backed up in backup_* directory"