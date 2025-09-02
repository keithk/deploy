import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { info, warn, debug } from "./logging";

/**
 * Default .gitignore content for sites
 */
const DEFAULT_GITIGNORE = `# Dependencies
node_modules/
bower_components/
vendor/

# Build outputs
dist/
build/
out/
.next/
.nuxt/
.vuepress/dist
.serverless/
.fusebox/
.dynamodb/
.tern-port
.vscode-test

# Environment files
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
.pnpm-debug.log*

# OS files
.DS_Store
Thumbs.db
*.swp
*.swo
*~

# IDE files
.idea/
.vscode/
*.sublime-project
*.sublime-workspace

# Testing
coverage/
.nyc_output/

# Temporary files
.tmp/
tmp/
temp/

# Package manager files
.npm/
.yarn/
.pnp.*
.yarn-integrity

# Ruby
*.gem
*.rbc
/.config
/coverage/
/InstalledFiles
/pkg/
/spec/reports/
/test/tmp/
/test/version_tmp/
/.bundle/
/lib/bundler/man/
.rvmrc

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
ENV/
env.bak/
venv.bak/
.pytest_cache/
.coverage
.coverage.*
.cache
.mypy_cache/
.dmypy.json
dmypy.json
.pyre/

# Go
*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out
/vendor/
/Godeps/

# Rust
/target/
**/*.rs.bk
Cargo.lock

# Deploy-specific
.deploy/
.railpacks/
`;

/**
 * Check if a directory has a git repository initialized
 */
export function hasGitRepo(dirPath: string): boolean {
  const gitDir = join(dirPath, ".git");
  return existsSync(gitDir);
}

/**
 * Initialize a git repository in the given directory
 */
export function initGitRepo(dirPath: string, options: {
  createInitialCommit?: boolean;
  addGitignore?: boolean;
  silent?: boolean;
} = {}): boolean {
  const {
    createInitialCommit = true,
    addGitignore = true,
    silent = false
  } = options;

  try {
    // Check if already has git
    if (hasGitRepo(dirPath)) {
      if (!silent) {
        debug(`Git repository already exists in ${dirPath}`);
      }
      return true;
    }

    if (!silent) {
      info(`Initializing git repository in ${dirPath}`);
    }

    // Initialize git repo
    execSync("git init", {
      cwd: dirPath,
      stdio: silent ? "ignore" : "inherit"
    });

    // Set initial branch name to main
    try {
      execSync("git branch -M main", {
        cwd: dirPath,
        stdio: "ignore"
      });
    } catch (e) {
      // Ignore error if branch already exists or git version doesn't support -M
      debug(`Could not set main branch: ${e}`);
    }

    // Add .gitignore if requested
    if (addGitignore) {
      const gitignorePath = join(dirPath, ".gitignore");
      if (!existsSync(gitignorePath)) {
        writeFileSync(gitignorePath, DEFAULT_GITIGNORE);
        if (!silent) {
          debug(`Created .gitignore in ${dirPath}`);
        }
      }
    }

    // Create initial commit if requested
    if (createInitialCommit) {
      try {
        // Configure git user for this repo if not set globally
        try {
          execSync("git config user.name", {
            cwd: dirPath,
            stdio: "ignore"
          });
        } catch {
          // Set a default user name if not configured
          execSync('git config user.name "Deploy System"', {
            cwd: dirPath,
            stdio: "ignore"
          });
        }

        try {
          execSync("git config user.email", {
            cwd: dirPath,
            stdio: "ignore"
          });
        } catch {
          // Set a default email if not configured
          execSync('git config user.email "deploy@localhost"', {
            cwd: dirPath,
            stdio: "ignore"
          });
        }

        // Add all files
        execSync("git add -A", {
          cwd: dirPath,
          stdio: "ignore"
        });

        // Create initial commit
        execSync('git commit -m "Initial commit"', {
          cwd: dirPath,
          stdio: "ignore"
        });

        if (!silent) {
          debug(`Created initial commit in ${dirPath}`);
        }
      } catch (e) {
        // It's okay if initial commit fails (e.g., no files to commit)
        debug(`Could not create initial commit: ${e}`);
      }
    }

    if (!silent) {
      info(`Successfully initialized git repository in ${dirPath}`);
    }
    return true;

  } catch (error) {
    warn(`Failed to initialize git repository in ${dirPath}: ${error}`);
    return false;
  }
}

/**
 * Initialize git repos for multiple directories
 * Returns array of directories that were initialized
 */
export function initGitRepos(
  dirs: Array<{ name: string; path: string }>,
  options: {
    createInitialCommit?: boolean;
    addGitignore?: boolean;
    silent?: boolean;
  } = {}
): string[] {
  const initialized: string[] = [];

  for (const dir of dirs) {
    if (!hasGitRepo(dir.path)) {
      if (initGitRepo(dir.path, options)) {
        initialized.push(dir.name);
      }
    }
  }

  if (initialized.length > 0 && !options.silent) {
    info(`Initialized git repositories for sites: ${initialized.join(", ")}`);
  }

  return initialized;
}

/**
 * Get git status for a directory
 */
export function getGitStatus(dirPath: string): {
  hasGit: boolean;
  branch?: string;
  hasUncommittedChanges?: boolean;
  hasUntrackedFiles?: boolean;
} {
  if (!hasGitRepo(dirPath)) {
    return { hasGit: false };
  }

  try {
    // Get current branch
    const branch = execSync("git branch --show-current", {
      cwd: dirPath,
      encoding: "utf8"
    }).trim();

    // Check for uncommitted changes
    const status = execSync("git status --porcelain", {
      cwd: dirPath,
      encoding: "utf8"
    });

    const hasChanges = status.length > 0;
    const hasUntracked = status.includes("??");

    return {
      hasGit: true,
      branch: branch || "main",
      hasUncommittedChanges: hasChanges,
      hasUntrackedFiles: hasUntracked
    };
  } catch (error) {
    debug(`Error getting git status for ${dirPath}: ${error}`);
    return {
      hasGit: true,
      branch: "unknown",
      hasUncommittedChanges: false,
      hasUntrackedFiles: false
    };
  }
}