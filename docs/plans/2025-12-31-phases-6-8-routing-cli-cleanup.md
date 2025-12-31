# Phases 6-8: Routing, CLI, and Cleanup

## Overview
This plan covers the refactoring of the subdomain router, Caddyfile generation, CLI simplification, and wiring up the deploy orchestrator to the API.

## Goals
1. Update subdomain router to use database-backed site discovery
2. Simplify Caddyfile generation to use wildcard routing
3. Simplify CLI to only essential commands
4. Wire up the deploy endpoint to actually trigger deployments

## Implementation Phases

### Phase 6.1: Update Subdomain Router
**Status**: [x] Complete

**Changes to `packages/server/src/routing/subdomainRouter.ts`**:
- Use SiteModel from database instead of SiteConfig from filesystem
- Use checkSiteAccess from middleware/auth.ts for visibility/auth checks
- Proxy requests to `localhost:${site.port}` for running containers
- Show status pages for stopped/building/error sites

### Phase 6.2: Update Caddy Config Generation
**Status**: [x] Complete

**Changes to `packages/core/src/utils/caddyfile.ts`**:
- Remove per-site subdomain configuration
- Generate wildcard routing `*.{PROJECT_DOMAIN}` to deploy server
- Route `{PROJECT_DOMAIN}` to deploy server
- Let deploy server handle subdomain to container routing

### Phase 7.1: Simplify CLI
**Status**: [x] Complete

**Changes to `packages/cli/src/commands/index.ts`**:
- Keep: setup, start, doctor, actions
- Remove/disable: site, processes, build

### Phase 8.1: Wire Up Deploy to API
**Status**: [x] Complete

**Changes to `packages/server/src/api/sites.ts`**:
- Import deploySite from services/deploy
- Actually call deploySite in POST /api/sites/:id/deploy
- Run deployment in background

## Test Plan
- Unit tests for subdomain router
- Unit tests for sites API deploy endpoint
- Integration tests for deployment flow

## Data Model
Uses existing Site model from database:
- id, name (subdomain), git_url, branch, type, visibility
- status: running | stopped | building | error
- container_id, port for running sites
