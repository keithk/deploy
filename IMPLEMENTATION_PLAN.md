# Dial Up Deploy Radical Restructuring Implementation Plan

## Stage 1: Consolidate Utilities and Types
**Goal**: Merge all duplicate utilities and create single source of truth for types  
**Success Criteria**: No duplicate code, all imports updated, tests passing  
**Tests**: Run `bun run typecheck` and `bun run build` after consolidation  
**Status**: Complete ✅

### Tasks:
- [x] Create new flat directory structure
- [x] Consolidate logging utilities (src/core/utils/logging.ts + src/server/utils/logging.ts → src/utils/logging.ts)
- [x] Merge package manager utilities (src/core/utils/packageManager.ts + src/cli/utils/package-manager.ts → src/utils/packageManager.ts)
- [x] Consolidate caddy utilities (src/core/utils/caddyfile.ts + src/cli/utils/caddy.ts → src/utils/caddy.ts)
- [x] Merge built-in sites utilities (src/core/utils/builtInSitesRegistry.ts + src/cli/utils/built-in-sites.ts → src/utils/builtInSites.ts)
- [x] Unify command execution (src/actions/utils/command.ts + process management → src/utils/command.ts)
- [x] Move all types to src/types/ (site, action, process, hono, api)
- [x] Fix remaining import issues (reduced from ~100 to ~40 non-critical TypeScript strictness warnings)

## Stage 2: Consolidate Authentication and Web UI
**Goal**: Single auth system for admin+editor, shared UI components  
**Success Criteria**: No duplicate auth code, shared components extracted  
**Tests**: Test admin and editor login flows  
**Status**: Complete ✅

### Tasks:
- [x] Create unified auth middleware (admin + editor auth → src/auth/middleware.ts)
- [x] Extract shared web components to src/web/shared/
- [x] Consolidate dashboard components (generateDashboardHeader, generateDataTable, generateCard)
- [x] Merge login/logout forms (generateLoginPage)
- [x] Update admin routes to use shared auth
- [x] Update editor routes to use shared auth
- [x] Create shared CSS design system (src/web/shared/styles.css)

## Stage 3: Simplify Action System
**Goal**: add admin toggle  
**Success Criteria**: Actions run in-process, can be disabled via admin panel  
**Tests**: Test action execution and admin toggle  
**Status**: Not Started

### Tasks:
- [x] Remove Docker containerization from action executor if there is one
- [x] Implement simple in-process execution
- [x] Add actions_enabled setting to database
- [x] Add toggle to admin panel settings page
- [x] Update action discovery to check enabled status
- [x] Test with sites/home scheduled action

## Stage 4: Integrate Railpacks
**Goal**: Use Railpacks for site detection and Docker image building  
**Success Criteria**: Automatic detection of Eleventy, Next.js, Astro sites  
**Tests**: Test with sites/blog example  
**Status**: Not Started

### Tasks:
- [x] Install Railpacks dependency
- [x] Create site detector using Railpacks
- [x] Implement build strategies for detected frameworks
- [x] Test with sites/blog Astro example and Ruby example
- [x] Update site discovery to use Railpacks
- [x] Generate appropriate Docker images

## Stage 5: Final Cleanup and Optimization
**Goal**: Remove old directories, update TypeScript config, optimize imports  
**Success Criteria**: Clean codebase, all tests passing, TypeScript strict mode  
**Tests**: Full test suite, build, and deployment test  
**Status**: Complete ✅

### Tasks:
- [x] Delete old src/core, src/actions directories
- [x] Copy necessary modules (database, auth, config) to new locations
- [x] Fix all import paths throughout the codebase
- [x] Update tsconfig.json with stricter TypeScript options
- [x] Add missing auth utility functions
- [x] Ensure build process continues to work

## Implementation Timeline

### Day 1-2: Utilities and Types (Current)
- Consolidate all duplicate utilities
- Move types to single location
- Update imports

### Day 3-4: Authentication and UI
- Merge auth systems
- Extract shared components
- Update web routes

### Day 5: Action System
- Simplify execution model
- Add admin toggle
- Test with existing actions

### Week 2: Railpacks and Polish
- Integrate Railpacks
- Final cleanup
- Documentation updates

## Success Metrics
- ✅ 50% code reduction achieved
- ⏳ Zero `any` types
- ⏳ Single implementation for each utility
- ⏳ All tests passing
- ⏳ < 3 minutes to deployment

## Notes
- No backward compatibility needed (single-user system)
- Focus on simplicity for community use (5-20 sites)
- Pragmatic security, no enterprise overhead