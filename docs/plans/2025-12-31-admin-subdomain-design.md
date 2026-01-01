# Admin Subdomain & Primary Site Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move admin panel to `admin.keithlaugh.love`, allow setting a primary site to serve at the root domain, and discover actions from deployed sites.

**Architecture:** Admin panel served from subdomain with path-based client routing. Primary site setting determines which containerized site serves the root domain. Actions discovered at deploy time from site repositories.

**Tech Stack:** Bun, SQLite, Web Components, vanilla JS router

---

## Routing Architecture

| Request Host | Behavior |
|-------------|----------|
| `admin.{PROJECT_DOMAIN}` | Serve admin panel (index.html for all paths) |
| `{PROJECT_DOMAIN}` (root) | Proxy to primary site's container (if set), otherwise show "no primary site" page |
| `{subdomain}.{PROJECT_DOMAIN}` | Proxy to matching container (existing behavior) |

### Server Changes (createServer.ts)

1. Check if host is `admin.{PROJECT_DOMAIN}` → serve admin panel with SPA fallback
2. Check if host is root domain AND `primary_site` setting exists → proxy to that site's container
3. Otherwise, existing routing logic (database-backed sites, then filesystem sites)

### Admin Panel Routing

- Server serves `index.html` for any path under `admin.keithlaugh.love/*`
- Client-side router reads `window.location.pathname` and renders the right component
- Pages: `/` (dashboard), `/sites`, `/actions`, `/settings`, `/processes`

---

## Settings

### Data Model

New setting in database:
- Key: `primary_site`
- Value: site ID (UUID)

### Settings Page UI

- Dropdown to select primary site from list of running sites
- GitHub token field (already exists in API, just needs UI)
- Save button

### API

Existing endpoints:
- `GET /api/settings` - get all settings
- `PATCH /api/settings` - update settings

---

## Actions Discovery

### At Deploy Time (deploy.ts)

After successful build:
1. Scan `{clonePath}/.deploy/actions/` for action files
2. For each action, register in `actions` table with `site_id`
3. Remove previously registered actions for this site (clean slate)

### Schema Update

```sql
ALTER TABLE actions ADD COLUMN site_id TEXT REFERENCES sites(id);
```

### Actions Page Updates

- Show site name for each action
- Group or filter by site
- Display schedule, last run, next run

---

## Implementation Tasks

### Task 1: Database Migration
- Add `site_id` column to actions table

### Task 2: Actions Discovery in Deploy Service
- Scan `.deploy/actions/` after build
- Register actions with site association
- Clear old actions for site before registering new ones

### Task 3: Admin Subdomain Routing
- Detect `admin.{PROJECT_DOMAIN}` in createServer.ts
- Serve admin index.html for all paths (SPA fallback)
- Update on-demand TLS validation to allow admin subdomain

### Task 4: Primary Site Routing
- Check for `primary_site` setting when root domain requested
- Proxy to that site's container port
- Show placeholder page if no primary site set

### Task 5: Client-Side Router
- Create simple router in admin app.js
- Route based on `window.location.pathname`
- Update links to use real hrefs with click handlers

### Task 6: Settings Component
- Create `deploy-settings.js` component
- Fetch sites list and current settings
- Dropdown for primary site selection
- Save button that PATCHes /api/settings

### Task 7: Update Navigation
- Change nav to use `<a href="/path">` links
- Router intercepts clicks for SPA navigation
- Ensure browser back/forward works

---

## Validation Checklist

- [ ] `admin.keithlaugh.love/settings` loads settings page (survives refresh)
- [ ] `keithlaugh.love` serves the blog when blog is set as primary
- [ ] `blog.keithlaugh.love` still works independently
- [ ] Actions from blog repo appear in admin actions page
- [ ] Browser back/forward works in admin panel
