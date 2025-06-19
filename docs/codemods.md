# Codemods

DialUpDeploy includes a codemod system to help migrate breaking changes automatically. Codemods are automated transformations that can update your project structure, configuration files, and code to match new requirements.

---

## 🚀 Usage

### List Available Codemods

```bash
deploy migrate
```

This will show all available codemods with their descriptions and versions.

### Run a Codemod

```bash
# Dry run (preview changes without applying)
deploy migrate <codemod-name> --dry-run

# Apply changes
deploy migrate <codemod-name>

# Verbose output (show file paths)
deploy migrate <codemod-name> --verbose

# Force overwrite existing files
deploy migrate <codemod-name> --force
```

---

## 📦 Available Codemods

### config-migration (v1.0.0)

Migrates configuration files from the old `.dialup` structure to the new standardized structure.

**What it does:**
- Moves `.dialup/config.json` → `deploy.json` (root)
- Moves `config.json` → `deploy.json` (root fallback)
- Moves `sites/[name]/config.json` → `sites/[name]/.deploy/config.json`
- Moves `sites/[name]/.dialup/config.json` → `sites/[name]/.deploy/config.json`
- Moves `sites/[name]/.dialup/actions` → `sites/[name]/.deploy/actions`
- Moves `.dialup/actions` → `.deploy/actions` (root)
- Removes empty `.dialup` directories

**Usage:**
```bash
# Preview changes
deploy migrate config-migration --dry-run

# Apply migration
deploy migrate config-migration
```

---

## 🛠️ Creating Custom Codemods

Codemods are TypeScript modules located in `packages/cli/src/codemods/`. Each codemod exports a `Codemod` object with:

```typescript
export interface Codemod {
  name: string;
  description: string;
  version: string;
  run: (rootDir: string, options: CodemodOptions) => Promise<CodemodResult>;
}
```

### Example Codemod

```typescript
import type { Codemod } from "./types";

export const myCodemod: Codemod = {
  name: "my-codemod",
  description: "Description of what this codemod does",
  version: "1.0.0",
  
  async run(rootDir: string, options) {
    const changes = [];
    const errors = [];
    
    // Your transformation logic here
    
    return {
      success: errors.length === 0,
      changes,
      errors
    };
  }
};
```

### Change Types

Codemods can report different types of changes:

- `move`: Moving/renaming files
- `create`: Creating new files
- `delete`: Removing files  
- `update`: Modifying existing files

### Options

- `dryRun`: Preview changes without applying them
- `verbose`: Show detailed output including file paths
- `force`: Overwrite existing files without prompting

---

## 🔗 Related

- [Configuration](configuration.md) - For details on the new config structure
- [CLI Usage](../README.md#cli-commands) - For general CLI information