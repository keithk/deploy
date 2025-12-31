# Dial Up Deploy Community Scaling Project

## Overview
Transform Dial Up Deploy into a simple community hosting platform optimized for friend groups sharing resources on a medium VPS server. Focus on simplicity over enterprise features.

## Core Constraints
- **Admin panel is MANDATORY** - setup command must create admin account
- **User-level only** - no organizations, keep it simple  
- **Medium VPS scale** - optimize for medium VPS resource limits (4GB RAM, 2 CPU)
- **Community focus** - designed for friends hosting sites together

---

## Stage 1: Combined Admin & User System
**Goal**: Unified user system with admin at admin.yourdomain and public access at editor.yourdomain
**Success Criteria**: Admin setup creates first admin user, users can register/login, basic site management works
**Tests**: CLI setup creates admin, admin panel accessible, user registration works, basic auth
**Status**: Not Started

### Deliverables
- CLI setup creates first admin user during initialization  
- admin.yourdomain with admin interface (user management, settings)
- editor.yourdomain with login/register (can be disabled by admin)
- Unified SQLite schema for users (admin flag differentiates)
- Session-based authentication across both subdomains
- Admin can set per-user limits (sites, resources)
- Basic user dashboard showing their sites

---

## Stage 2: CodeMirror 6 Editor Interface
**Goal**: Basic but fun mono-font editor with file tree at editor.yourdomain
**Success Criteria**: Users can create sites, see file tree, edit files with syntax highlighting
**Tests**: Editor loads, file tree displays, CodeMirror editing works, create/save files
**Status**: Not Started

### Deliverables
- CodeMirror 6 integration with syntax highlighting
- Basic file tree view (mono font, minimal but fun design)
- Template selection for new site creation
- File operations: create, edit, save, delete, rename
- Simple site creation flow from templates
- Basic file management (no live preview yet)

---

## Stage 4: Resource Monitoring & Limits
**Goal**: Track and enforce resource usage per user on medium VPS
**Success Criteria**: System monitors resource usage, enforces limits, prevents overages
**Tests**: Resource tracking accuracy, limit enforcement, graceful degradation
**Status**: Not Started

### Deliverables
- Container resource monitoring
- Per-user resource allocation tracking
- Automatic enforcement of limits
- Resource usage dashboard in admin panel

---

## Stage 5: Container Optimization
**Goal**: Optimize container strategy for medium VPS constraints
**Success Criteria**: Efficient container management, minimal resource overhead
**Tests**: Container startup/shutdown performance, resource efficiency metrics
**Status**: Not Started

### Deliverables
- Optimized Docker/container strategy (Node 22-based)
- Container pooling/sharing where appropriate
- Resource-aware container scheduling
- Cleanup processes for unused containers

---

## Stage 6: Complete Admin Interface
**Goal**: Full admin panel for managing community hosting
**Success Criteria**: Admin can manage all users, sites, resources through web interface
**Tests**: All admin operations work, proper authorization, data consistency
**Status**: Not Started

### Deliverables
- User management interface
- Site deployment overview
- Resource usage analytics
- System health monitoring
- Template management for editor
- Backup/restore functionality

---

## Technical Decisions

### Database: SQLite (Default)
- Simple, file-based storage
- Perfect for community-scale deployments
- Easy backup/migration
- **Pluggable adapter pattern** for PostgreSQL/MySQL if needed

### Authentication
- Simple session-based auth
- Admin-level and user-level permissions
- No complex OAuth (keep it simple)

### Container Strategy
- Node 22-based containers (latest LTS)
- Shared containers where possible
- Resource limits per container
- Efficient cleanup and recycling
- Development containers for editor with hot reload

### Web Interface
- Server-side rendered with Bun
- CodeMirror 6 for editor interface
- WebSocket for real-time file sync
- Responsive design for mobile admin and editor

---

## Success Metrics
- Can host 10-20 friend sites on medium VPS server
- Admin setup takes < 5 minutes
- User self-registration and site creation < 2 minutes
- Web-based editor loads in < 3 seconds
- Development containers launch in < 10 seconds
- 99% uptime for community sites
- Resource utilization stays under 80% on medium VPS server
- Editor overhead < 25% of total system resources