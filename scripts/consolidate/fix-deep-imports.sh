#!/bin/bash

# Fix imports that still have /src/ in them
echo "🔧 Fixing deep import paths..."

# Fix ../core/src/ -> ../core/
find src -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's|\.\./core/src/|\.\./core/|g'

# Fix ../server/src/ -> ../server/
find src -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's|\.\./server/src/|\.\./server/|g'

# Fix ../actions/src/ -> ../actions/
find src -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's|\.\./actions/src/|\.\./actions/|g'

# Fix ../cli/src/ -> ../cli/
find src -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's|\.\./cli/src/|\.\./cli/|g'

# Fix ../../core/src/ -> ../../core/
find src -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's|\.\./\.\./core/src/|\.\./\.\./core/|g'

# Fix ../../server/src/ -> ../../server/
find src -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's|\.\./\.\./server/src/|\.\./\.\./server/|g'

# Fix some specific wrong paths
find src -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's|\.\./utils/built-in-sites|\.\./cli/utils/built-in-sites|g'

echo "✅ Import paths fixed"