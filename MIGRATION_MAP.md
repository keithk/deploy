# Package Migration Map

## Directory Structure Changes

### Before:
```
packages/
├── cli/src/
│   ├── admin/
│   ├── editor/
│   └── [cli files]
├── server/src/
├── core/src/
└── actions/src/
```

### After:
```
src/
├── cli/        # CLI commands and utilities
├── server/     # Server components
├── core/       # Shared utilities
├── actions/    # Action utilities
├── admin/      # Admin panel (extracted from cli)
└── editor/     # Code editor (extracted from cli)
```

## Import Path Changes

- `@keithk/deploy-core` → `../core` (or appropriate relative path)
- `@keithk/deploy-server` → `../server`
- `@keithk/deploy-actions` → `../actions`
- `@keithk/deploy-cli` → `../cli`

## Backup Location
Backup created at: backup_20250830_221016

## Next Steps
1. Run transform-imports.js to update all import paths
2. Run merge-packages.js to consolidate package.json files
3. Update tsconfig.json for new structure
4. Test the build process
