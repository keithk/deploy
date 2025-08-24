# Publishing Workflow

This document describes the correct workflow for publishing packages to npm from this monorepo.

## Overview

The monorepo uses a custom workflow to handle workspace dependencies properly during publishing, since changeset alone doesn't resolve `workspace:*` dependencies correctly for our setup.

## Publishing Process

### 1. Create Changeset

When you have changes to publish:

```bash
npx changeset
```

Select the packages that have changed and the type of change (patch/minor/major).

### 2. Version Bump

Apply the changeset to update package versions:

```bash
npx changeset version
```

This will:
- Update all package.json files with new versions  
- Update internal dependencies to use the new versions
- Remove the changeset file

### 3. Build All Packages

Ensure all packages are built:

```bash
bun run build:all
```

### 4. Publish

Use the custom publish script:

```bash
bun run publish
```

This will:
1. Build all packages (`bun run build:all`)
2. Resolve workspace dependencies to actual versions (`bun run resolve:workspace`)
3. Validate packages are ready for publishing (`bun run validate:packages`)
4. Publish to npm (`changeset publish --otp`)
5. Restore workspace dependencies for development (`bun run restore:workspace`)

## Manual Steps (if needed)

If you need to run steps individually:

```bash
# Resolve workspace dependencies
bun run resolve:workspace

# Validate packages
bun run validate:packages

# Publish (requires npm 2FA)
npx changeset publish

# Restore workspace dependencies
bun run restore:workspace
```

## Scripts Overview

- `resolve:workspace` - Converts `workspace:*` to actual version numbers
- `validate:packages` - Ensures packages are valid before publishing
- `restore:workspace` - Restores `workspace:*` dependencies for local development

## Important Notes

1. **Never commit** resolved dependencies - they are temporary for publishing only
2. **Always restore** workspace dependencies after publishing
3. **OTP required** for publishing (2FA enabled on npm account)
4. **Build first** - packages must be built before publishing

## Testing Global Installation

After publishing, test the global installation:

```bash
npm install -g @keithk/deploy-cli@latest
deploy --version
deploy --help
```

## Troubleshooting

### Workspace Dependencies Not Resolved

If published packages still show `workspace:*`, run the resolve script manually:

```bash
node scripts/resolve-workspace-deps.js
```

### Validation Failures

Check the validation output:

```bash
node scripts/validate-packages.js
```

Common issues:
- Missing dist directories (run `bun run build:all`)
- Workspace dependencies not resolved (run resolve script)
- Missing files listed in package.json files array