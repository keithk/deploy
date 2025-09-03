# CLI Reference

Complete reference for all Deploy CLI commands.

## Global Options

All commands support these global options:

```bash
--help, -h     Show help for command
--version, -v  Show Deploy version
--verbose      Show detailed output
--quiet        Suppress output
```

## Core Commands

### deploy init

Initialize a new site in the current directory.

```bash
deploy init [options]

Options:
  --name <name>      Site name (default: directory name)
  --port <port>      Port number (default: auto-detect)
  --type <type>      Site type (default: auto-detect)
  --no-build         Skip initial build
```

**Examples:**
```bash
# Auto-detect everything
deploy init

# Specify name
deploy init --name my-awesome-app

# Specify port
deploy init --port 8080
```

### deploy run

Build and run a site.

```bash
deploy run [site-name] [options]

Options:
  --dev              Run in development mode
  --production       Run in production mode
  --rebuild          Force rebuild container
  --no-build         Skip build step
  --attach           Attach to container output
```

**Examples:**
```bash
# Run current directory site
deploy run

# Run specific site
deploy run my-app

# Development mode with live reload
deploy run --dev

# Force rebuild
deploy run --rebuild
```

### deploy stop

Stop a running site.

```bash
deploy stop [site-name] [options]

Options:
  --all              Stop all sites
  --force            Force stop (SIGKILL)
```

**Examples:**
```bash
# Stop current site
deploy stop

# Stop specific site
deploy stop my-app

# Stop all sites
deploy stop --all
```

### deploy list

List all sites.

```bash
deploy list [options]
deploy ls [options]

Options:
  --running          Show only running sites
  --stopped          Show only stopped sites
  --json             Output as JSON
  --verbose          Show detailed info
```

**Examples:**
```bash
# List all sites
deploy list

# Only running sites
deploy list --running

# Detailed view
deploy list --verbose
```

### deploy logs

View site logs.

```bash
deploy logs [site-name] [options]

Options:
  --follow, -f       Follow log output
  --tail <n>         Number of lines to show (default: 50)
  --since <time>     Show logs since timestamp
  --until <time>     Show logs until timestamp
  --timestamps       Show timestamps
```

**Examples:**
```bash
# View last 50 lines
deploy logs my-app

# Follow logs in real-time
deploy logs my-app -f

# Last 100 lines with timestamps
deploy logs my-app --tail 100 --timestamps
```

### deploy restart

Restart a site.

```bash
deploy restart [site-name] [options]

Options:
  --all              Restart all sites
  --rebuild          Rebuild before restart
```

**Examples:**
```bash
# Restart current site
deploy restart

# Restart with rebuild
deploy restart --rebuild
```

## Setup Commands

### deploy setup

Set up Deploy on your system.

```bash
deploy setup [environment] [options]

Environments:
  local              Local development (default)
  production         Production server

Options:
  --skip-docker      Skip Docker installation
  --skip-caddy       Skip Caddy installation
  --skip-dns         Skip DNS configuration
  --force            Force reinstall everything
```

**Examples:**
```bash
# Local development setup
deploy setup

# Production setup
deploy setup production

# Skip Docker if already installed
deploy setup --skip-docker
```

### deploy doctor

Diagnose system configuration.

```bash
deploy doctor [options]

Options:
  --verbose, -v      Show detailed diagnostics
  --fix              Attempt to fix issues
```

**Examples:**
```bash
# Basic health check
deploy doctor

# Detailed diagnostics with fixes
deploy doctor -v --fix
```

## Site Management

### deploy site

Manage sites.

```bash
deploy site <command> [options]

Commands:
  create <name>      Create a new site
  delete <name>      Delete a site
  info <name>        Show site information
  config <name>      Edit site configuration
```

**Examples:**
```bash
# Create new site
deploy site create my-app

# Delete site
deploy site delete old-app

# Show site info
deploy site info my-app
```

### deploy build

Build a site without running it.

```bash
deploy build [site-name] [options]

Options:
  --no-cache         Don't use build cache
  --verbose          Show build output
```

**Examples:**
```bash
# Build current site
deploy build

# Build without cache
deploy build --no-cache
```

## Environment Management

### deploy env

Manage environment variables.

```bash
deploy env <command> [site-name] [options]

Commands:
  list               List all variables
  set KEY=VALUE      Set a variable
  unset KEY          Remove a variable
  import <file>      Import from .env file
  export             Export to .env file
```

**Examples:**
```bash
# List environment variables
deploy env list my-app

# Set a variable
deploy env set DATABASE_URL=postgres://... my-app

# Import from .env file
deploy env import .env.production my-app
```

## Domain Management

### deploy domain

Manage custom domains.

```bash
deploy domain <command> [options]

Commands:
  add <domain> <site>     Add domain to site
  remove <domain>         Remove domain
  list                    List all domains
```

**Examples:**
```bash
# Add custom domain
deploy domain add example.com my-app

# List all domains
deploy domain list
```

## Admin Commands

### deploy admin

Admin panel management.

```bash
deploy admin <command> [options]

Commands:
  start              Start admin panel
  stop               Stop admin panel
  restart            Restart admin panel
  open               Open in browser
  reset-password     Reset admin password
```

**Examples:**
```bash
# Start admin panel
deploy admin start

# Reset password
deploy admin reset-password

# Open in browser
deploy admin open
```

## Editor Commands

### deploy editor

Editor management.

```bash
deploy editor <command> [options]

Commands:
  start              Start editor
  stop               Stop editor
  restart            Restart editor
  open [site]        Open editor for site
```

**Examples:**
```bash
# Start editor
deploy editor start

# Open editor for specific site
deploy editor open my-app
```

## Process Management

### deploy processes

View and manage processes.

```bash
deploy processes [options]
deploy ps [options]

Options:
  --all              Show all processes
  --json             Output as JSON
  --watch            Auto-refresh display
```

**Examples:**
```bash
# List all processes
deploy processes

# Watch processes (auto-refresh)
deploy processes --watch

# JSON output for scripting
deploy ps --json
```

## Database Commands

### deploy db

Database management.

```bash
deploy db <command> [options]

Commands:
  migrate            Run migrations
  reset              Reset database
  backup <file>      Backup database
  restore <file>     Restore from backup
```

**Examples:**
```bash
# Run migrations
deploy db migrate

# Backup database
deploy db backup backup.db

# Reset database (dangerous!)
deploy db reset
```

## Action Commands

### deploy actions

Manage actions (webhooks, scheduled tasks).

```bash
deploy actions <command> [site-name] [options]

Commands:
  list               List all actions
  enable <action>    Enable an action
  disable <action>   Disable an action
  run <action>       Run action manually
  logs <action>      View action logs
```

**Examples:**
```bash
# List actions for site
deploy actions list my-app

# Run action manually
deploy actions run daily-backup my-app

# View action logs
deploy actions logs webhook my-app
```

## Utility Commands

### deploy migrate

Run database migrations.

```bash
deploy migrate [options]

Options:
  --rollback         Rollback last migration
  --rollback-all     Rollback all migrations
  --status           Show migration status
```

**Examples:**
```bash
# Run pending migrations
deploy migrate

# Check migration status
deploy migrate --status
```

### deploy caddyfile

Generate Caddyfile configuration.

```bash
deploy caddyfile [options]

Options:
  --output <file>    Write to file (default: stdout)
  --validate         Validate configuration
```

**Examples:**
```bash
# Generate and display
deploy caddyfile

# Save to file
deploy caddyfile --output /etc/caddy/Caddyfile
```

### deploy update

Update Deploy to latest version.

```bash
deploy update [options]

Options:
  --check            Check for updates only
  --force            Force update
```

**Examples:**
```bash
# Check for updates
deploy update --check

# Update Deploy
deploy update
```

## Development Commands

### deploy dev

Start development environment.

```bash
deploy dev [site-name] [options]

Options:
  --port <port>      Development server port
  --open             Open in browser
  --no-watch         Disable file watching
```

**Examples:**
```bash
# Start dev server
deploy dev

# Custom port and open browser
deploy dev --port 3456 --open
```

### deploy exec

Execute command in container.

```bash
deploy exec [site-name] <command>

Options:
  --interactive, -i  Interactive mode
  --tty, -t         Allocate TTY
```

**Examples:**
```bash
# Run command
deploy exec my-app ls -la

# Interactive shell
deploy exec my-app -it /bin/sh

# Run npm command
deploy exec my-app npm list
```

## Configuration Commands

### deploy config

View and edit Deploy configuration.

```bash
deploy config <command> [options]

Commands:
  show               Show current config
  set <key> <value>  Set config value
  unset <key>        Remove config value
  reset              Reset to defaults
```

**Examples:**
```bash
# Show configuration
deploy config show

# Set default port range
deploy config set portRange 3000-4000
```

## Common Workflows

### Deploy a New Site
```bash
cd /path/to/my-app
deploy init
deploy run
```

### Update and Redeploy
```bash
# Make code changes
git pull
deploy run --rebuild
```

### Debug a Failing Site
```bash
deploy logs my-app -f
deploy exec my-app -it /bin/sh
deploy doctor -v
```

### Production Deployment
```bash
deploy setup production
deploy init --name production-app
deploy env import .env.production production-app
deploy run production-app --production
deploy domain add example.com production-app
```

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Misuse of command
- `3` - Configuration error
- `4` - Build failed
- `5` - Container error
- `127` - Command not found

## Environment Variables

Deploy respects these environment variables:

- `DEPLOY_HOME` - Deploy data directory (default: ~/.deploy)
- `DEPLOY_ENV` - Environment (development/production)
- `DEPLOY_DEBUG` - Enable debug output
- `NO_COLOR` - Disable colored output
- `DEPLOY_QUIET` - Suppress all output

## Getting Help

```bash
# General help
deploy --help

# Command-specific help
deploy run --help
deploy site create --help

# System diagnostics
deploy doctor -v
```