---
"@keithk/deploy-core": patch
"@keithk/deploy-cli": patch
"@keithk/deploy-server": patch
"@keithk/deploy-actions": patch
---

Migrate from Lerna to Changesets for modern version management

This change migrates the project from Lerna to Changesets for a more modern and developer-friendly versioning workflow. The new system provides:

- Better developer experience with guided changelog creation
- More explicit versioning intentions with changeset files
- Improved CI/CD integration capabilities
- Active maintenance and modern features

### Migration Changes

- Replaced `lerna version` with `changeset version`
- Replaced `lerna publish` with `changeset publish`
- Added `changeset add` for creating version bump intentions
- Updated package.json scripts to use Changesets commands
- Removed lerna.json configuration file