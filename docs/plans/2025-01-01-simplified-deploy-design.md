# Simplified Deploy - Design Document

## Overview

Rethink Dial Up Deploy as a personal deployment tool inspired by exe.dev. Strip multi-user complexity, embrace Railpacks for auto-detection, and build a clean web dashboard as the primary interface.

## Goals

- **Simple**: Git URL + subdomain → site is live
- **Multi-language**: Rust, WASM, Node, Python, etc. via Railpacks
- **Dashboard-first**: Web UI is primary, CLI just for server admin
- **Actions as first-class**: Cloudflare Workers-style edge functions
- **Private by default**: SSH key auth, shareable temporary links

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DigitalOcean Droplet                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐     ┌──────────────────────────────────┐  │
│  │    Caddy     │────▶│         Deploy Server            │  │
│  │  (SSL/proxy) │     │  - Dashboard (port 3000)         │  │
│  └──────────────┘     │  - Action runner                 │  │
│                       │  - Container orchestration       │  │
│                       └──────────────────────────────────┘  │
│                                    │                         │
│                                    ▼                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Docker Containers                     ││
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                 ││
│  │  │  blog   │  │  durak  │  │  book   │  ...            ││
│  │  │ :8001   │  │ :8002   │  │ :8003   │                 ││
│  │  └─────────┘  └─────────┘  └─────────┘                 ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Site Types

Only two:

- **auto**: Railpacks detects language/framework, builds container automatically
- **passthrough**: Site manages its own port/server, Caddy routes to it

## Dashboard UI

Tech stack: Web Components, Open Props, Bun, monospace fonts

```
┌─────────────────────────────────────────────────────────────────┐
│  🌐 keith.business                                  [Settings]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SITES  [+ New]                              [Search...]        │
│  ─────────────────────────────────────────────────────────────  │
│  ● blog          blog.keith.business  [Logs] [Redeploy]   ⋮    │
│  ● durak         durak.keith.business [Logs] [Redeploy]   ⋮    │
│  ○ trip-planner  trip.keith.business  [Logs] [Start]      ⋮    │
│                                                                 │
│  ACTIONS  [+ New]                                               │
│  ─────────────────────────────────────────────────────────────  │
│  ⏱ sync-raindrop     blog      every 6h       [Run] [Logs]  ⋮  │
│  🔗 github-webhook    —        on push        [Logs]        ⋮  │
└─────────────────────────────────────────────────────────────────┘
```

### "+ New Site" Flow

1. Enter git URL
2. Choose subdomain (auto-suggested from repo name)
3. Click Create
4. Railpacks detects, builds, deploys
5. Site is live (private by default)

## Auth & Visibility

### Dashboard Access

SSH key authentication (exe.dev style):
- `ssh keith.business` → opens dashboard or returns login URL
- Public key stored on server, validates against it

### Site Visibility

- **private** (default): Only accessible when logged in or via share link
- **public**: Anyone can access

### Share Links

Temporary URLs for sharing private sites:
- Generate from dashboard with expiry (1h, 24h, 7d)
- Token-based: `blog.keith.business?token=abc123`

## Data Model

### sites
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key |
| name | TEXT | Subdomain |
| git_url | TEXT | Repository URL |
| branch | TEXT | Default: main |
| type | TEXT | auto \| passthrough |
| visibility | TEXT | public \| private |
| status | TEXT | running \| stopped \| building \| error |
| container_id | TEXT | Docker container ID |
| port | INTEGER | Assigned port |
| env_vars | TEXT | JSON, encrypted |
| created_at | DATETIME | |
| last_deployed_at | DATETIME | |

### actions
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key |
| name | TEXT | Action name |
| type | TEXT | scheduled \| webhook \| hook |
| site_id | TEXT | Nullable, for site-attached actions |
| schedule | TEXT | Cron string (for scheduled) |
| hook_event | TEXT | site.deployed, site.started, etc. |
| code | TEXT | Inline code or null |
| git_url | TEXT | Repo URL if code from git |
| entry_path | TEXT | File path in repo |
| enabled | BOOLEAN | |
| last_run_at | DATETIME | |
| last_run_status | TEXT | |

### share_links
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key |
| site_id | TEXT | Foreign key |
| token | TEXT | Random string |
| expires_at | DATETIME | |
| created_at | DATETIME | |

### logs
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key |
| site_id | TEXT | Nullable |
| action_id | TEXT | Nullable |
| type | TEXT | build \| runtime \| action |
| content | TEXT | Log content |
| timestamp | DATETIME | Auto-pruned after 7 days |

## Actions System

### Types

1. **Scheduled**: Cron-based execution (sync-raindrop every 6h)
2. **Webhook**: HTTP endpoint triggers code (github deploy hooks)
3. **Hook**: Internal lifecycle events (site.deployed, site.started)

### Action-Only Sites

Lightweight functions without full containers:
- Run in isolated Bun processes
- Fast cold start
- Access to env vars (global + action-specific)

### Handler Interface

```typescript
export default async function(ctx: ActionContext) {
  // ctx.type: 'scheduled' | 'webhook' | 'hook'
  // ctx.request: Request (for webhooks)
  // ctx.event: { type, site, ... } (for hooks)
  // ctx.env: environment variables

  return new Response('OK')
}
```

## Environment Variables

Two layers, merged at runtime:

1. **Global**: `.env` in wrapper repo (shared secrets)
2. **Per-site**: Set in dashboard (site-specific overrides)

Injected into containers as environment variables.

## Deployment Flow

### New Site

1. Clone repo to `/var/deploy/sites/{name}/`
2. Railpacks analyzes codebase
3. Railpacks builds Docker image
4. Start container on auto-assigned port
5. Update Caddy config for subdomain routing
6. Site is live (private by default)

### Redeploy

1. `git pull` in existing checkout
2. Rebuild image (Railpacks layer caching)
3. Start new container, verify health
4. Stop old container (zero-downtime)

### GitHub Webhook

- Dashboard provides webhook URL: `https://keith.business/_/webhook/{site}`
- Add to GitHub repo settings
- Push to main → auto-redeploy

## CLI Commands

Minimal, admin-only:

| Command | Purpose |
|---------|---------|
| `deploy setup` | Initialize server (install deps, configure) |
| `deploy start` | Start the server |
| `deploy doctor` | Diagnose issues |

All site/action management happens in dashboard.

## What Gets Removed

- Multi-user system (users.ts, roles, permissions)
- Resource limits/quotas
- Site type complexity (static, static-build, dynamic, docker, built-in)
- CLI site management commands
- Editing session manager

## What Gets Built

- Dashboard UI (Web Components + Open Props)
- SSH key authentication
- Private sites + share links
- Git URL → deploy flow
- Action-only lightweight runners

## Wrapper Repo Structure

```
keith-is-host/
├── .env                 # DOMAIN, secrets
├── deploy.config.ts     # Custom settings
├── package.json         # imports @keithk/deploy
└── authorized_keys      # SSH public keys for auth
```

Sites live in `/var/deploy/sites/` on server, not in this repo.

## Test Plan

1. Fresh DigitalOcean droplet
2. Use `keith.business` as test domain
3. Validate full flow: setup → dashboard → add site → deploy
4. When stable, switch `keith.is` to new server

## Status

- [ ] Phase 1: Strip existing complexity
- [ ] Phase 2: New data model + migrations
- [ ] Phase 3: Dashboard UI
- [ ] Phase 4: SSH auth + visibility system
- [ ] Phase 5: Git URL deploy flow
- [ ] Phase 6: Actions system refinement
- [ ] Phase 7: Production setup + migration
