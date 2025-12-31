# Interactive Setup Wizard

## Overview
Transform the setup command from a non-interactive script into a guided wizard that collects configuration through questions.

## Goals
1. Guide users through configuration with clear prompts
2. Support both local development and production environments
3. Create all necessary directories, files, and run migrations
4. Provide DigitalOcean bootstrap script for fresh droplets

## Data Model
Configuration collected:
- Environment: local | production
- Domain: PROJECT_DOMAIN
- HTTP Port: PORT
- SSH Port: SSH_PORT
- Sites Directory: SITES_DIR
- SSH Public Key: for authorized_keys

## Components

### 1. Interactive Setup Command (`packages/cli/src/commands/setup.ts`)
- Display ASCII art header
- Collect answers via inquirer prompts
- Validate inputs (domain format, port numbers, key format)
- Execute setup actions in sequence with progress indicators

### 2. DigitalOcean Setup Script (`scripts/digitalocean-setup.sh`)
- Bootstrap script for fresh Ubuntu droplets
- Installs: Bun, Docker, Caddy, Railpacks
- Creates deploy user
- Clones repository and runs interactive setup

### 3. Systemd Service Template (`config/deploy.service`)
- Service file for running deploy in production

## Implementation Phases

- [x] Phase 1: Read existing setup code and understand structure
- [x] Phase 2: Create the interactive setup command with inquirer
- [x] Phase 3: Create DigitalOcean bootstrap script
- [x] Phase 4: Create systemd service template
- [x] Phase 5: Write tests and verify functionality

## Test Plan
- Unit tests for validation functions
- Manual testing of interactive flow
