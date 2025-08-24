# @keithk/deploy-cli

## 0.1.0

### Minor Changes

- add html admin panel with very little functionality, clean up actions, move most /sites to /examples

### Patch Changes

- Updated dependencies
  - @keithk/deploy-actions@0.1.0
  - @keithk/deploy-core@0.1.0
  - @keithk/deploy-server@0.1.0

## 0.0.9

### Patch Changes

- Better caddy support
- Updated dependencies
  - @keithk/deploy-actions@0.0.9
  - @keithk/deploy-server@0.0.9
  - @keithk/deploy-core@0.0.8

## 0.0.8

### Patch Changes

- 0d08f4a: Migrate from Lerna to Changesets for modern version management

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

- Updated dependencies [0d08f4a]
  - @keithk/deploy-core@0.0.7
  - @keithk/deploy-server@0.0.8
  - @keithk/deploy-actions@0.0.8
