# Migration from Lerna to Changesets

This document outlines the migration from Lerna to Changesets for version management and publishing.

## What Changed

### Before (Lerna)
```bash
# Version packages
bun run version

# Publish packages
bun run publish
```

### After (Changesets)
```bash
# Add a changeset (describe changes)
bun run changeset

# Version packages based on changesets
bun run version

# Publish packages
bun run publish

# Check changeset status
bun run changeset:status
```

## New Workflow

### 1. Making Changes
When you make changes that should trigger a version bump:

```bash
# Add a changeset describing your changes
bun run changeset
# Follow the interactive prompts to select packages and change types
```

### 2. Versioning
When ready to create new versions:

```bash
# Apply changesets and update package versions
bun run version
# This will update package.json files and remove consumed changesets
```

### 3. Publishing
To publish the new versions:

```bash
# Build and publish all packages
bun run publish
```

## Benefits

- **Better Documentation**: Changesets require explicit documentation of what changed
- **Selective Versioning**: Choose exactly which packages to version and how
- **Modern Tooling**: Active development and better CI/CD integration
- **Clear Intent**: Changeset files show exactly what changes are planned

## Change Types

- **patch**: Bug fixes and minor updates (0.0.X)
- **minor**: New features that don't break existing APIs (0.X.0)
- **major**: Breaking changes (X.0.0)

## Example Changeset File

```markdown
---
"@keithk/deploy-core": minor
"@keithk/deploy-server": patch
---

Add new configuration option for custom SSL certificates

This adds support for custom SSL certificates in the server configuration,
allowing users to provide their own certificates instead of relying on
automatic HTTPS.
```

## CI/CD Integration

Changesets work well with GitHub Actions and can automate the versioning and publishing process. Future enhancements could include:

- Automated PR creation for version bumps
- Automatic publishing on merge to main
- Release notes generation from changesets

## Migration Notes

- All existing packages maintain their current versions
- Independent versioning is preserved (each package can have its own version)
- Publishing access remains set to "public"
- The migration itself is documented in a changeset for transparency