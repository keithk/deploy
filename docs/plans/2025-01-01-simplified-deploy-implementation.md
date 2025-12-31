# Simplified Deploy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Dial Up Deploy into a personal deployment tool with a clean web dashboard, SSH auth, git-based deployments, and first-class actions.

**Architecture:** Single server with Caddy (SSL/routing) → Deploy Server (dashboard + orchestration) → Docker containers (via Railpacks). Sites are individual git repos, not filesystem folders. Dashboard is primary interface, CLI is admin-only.

**Tech Stack:** Bun, Hono, Web Components, Open Props, SQLite, Docker, Railpacks, Caddy

---

## Phase 1: Foundation & Data Model

### Task 1.1: Create New Database Schema

**Files:**
- Create: `packages/core/src/database/schema.ts`
- Create: `packages/core/src/database/migrations/001-simplified-schema.ts`
- Modify: `packages/core/src/database/database.ts`

**Step 1: Write the schema types**

```typescript
// packages/core/src/database/schema.ts
export interface Site {
  id: string;
  name: string;           // subdomain
  git_url: string;
  branch: string;         // default: main
  type: 'auto' | 'passthrough';
  visibility: 'public' | 'private';
  status: 'running' | 'stopped' | 'building' | 'error';
  container_id: string | null;
  port: number | null;
  env_vars: string;       // JSON, encrypted
  created_at: string;
  last_deployed_at: string | null;
}

export interface Action {
  id: string;
  name: string;
  type: 'scheduled' | 'webhook' | 'hook';
  site_id: string | null;
  schedule: string | null;
  hook_event: string | null;
  code: string | null;
  git_url: string | null;
  entry_path: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
}

export interface ShareLink {
  id: string;
  site_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface Log {
  id: string;
  site_id: string | null;
  action_id: string | null;
  type: 'build' | 'runtime' | 'action';
  content: string;
  timestamp: string;
}

export interface Session {
  id: string;
  token: string;
  created_at: string;
  expires_at: string;
}

export interface Settings {
  key: string;
  value: string;
}
```

**Step 2: Write the migration**

```typescript
// packages/core/src/database/migrations/001-simplified-schema.ts
import type { Database } from "bun:sqlite";

export function up(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      git_url TEXT NOT NULL,
      branch TEXT DEFAULT 'main',
      type TEXT DEFAULT 'auto',
      visibility TEXT DEFAULT 'private',
      status TEXT DEFAULT 'stopped',
      container_id TEXT,
      port INTEGER,
      env_vars TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_deployed_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      site_id TEXT REFERENCES sites(id),
      schedule TEXT,
      hook_event TEXT,
      code TEXT,
      git_url TEXT,
      entry_path TEXT,
      enabled INTEGER DEFAULT 1,
      last_run_at TEXT,
      last_run_status TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES sites(id),
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      site_id TEXT REFERENCES sites(id),
      action_id TEXT REFERENCES actions(id),
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`);
}

export function down(db: Database): void {
  db.run(`DROP TABLE IF EXISTS logs`);
  db.run(`DROP TABLE IF EXISTS share_links`);
  db.run(`DROP TABLE IF EXISTS actions`);
  db.run(`DROP TABLE IF EXISTS sessions`);
  db.run(`DROP TABLE IF EXISTS settings`);
  db.run(`DROP TABLE IF EXISTS sites`);
}
```

**Step 3: Run migration and verify tables exist**

Run: `bun run build:core`

**Step 4: Commit**

```bash
git add packages/core/src/database/
git commit -m "feat: add simplified database schema for sites, actions, share links"
```

---

### Task 1.2: Create Site Repository Model

**Files:**
- Create: `packages/core/src/database/models/site.ts`
- Modify: `packages/core/src/database/models/index.ts`

**Step 1: Write the Site model with CRUD operations**

```typescript
// packages/core/src/database/models/site.ts
import { Database } from "../database";
import type { Site } from "../schema";
import { randomUUID } from "crypto";

export class SiteModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  create(data: Omit<Site, "id" | "created_at" | "last_deployed_at" | "status" | "container_id" | "port">): Site {
    const id = randomUUID();
    const site: Site = {
      id,
      name: data.name,
      git_url: data.git_url,
      branch: data.branch || "main",
      type: data.type || "auto",
      visibility: data.visibility || "private",
      status: "stopped",
      container_id: null,
      port: null,
      env_vars: data.env_vars || "{}",
      created_at: new Date().toISOString(),
      last_deployed_at: null,
    };

    this.db.run(
      `INSERT INTO sites (id, name, git_url, branch, type, visibility, status, env_vars, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [site.id, site.name, site.git_url, site.branch, site.type, site.visibility, site.status, site.env_vars, site.created_at]
    );

    return site;
  }

  findById(id: string): Site | null {
    const results = this.db.query<Site>(`SELECT * FROM sites WHERE id = ?`, [id]);
    return results[0] || null;
  }

  findByName(name: string): Site | null {
    const results = this.db.query<Site>(`SELECT * FROM sites WHERE name = ?`, [name]);
    return results[0] || null;
  }

  findAll(): Site[] {
    return this.db.query<Site>(`SELECT * FROM sites ORDER BY created_at DESC`);
  }

  update(id: string, data: Partial<Site>): Site | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== "id" && key !== "created_at") {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return existing;

    values.push(id);
    this.db.run(`UPDATE sites SET ${fields.join(", ")} WHERE id = ?`, values);

    return this.findById(id);
  }

  delete(id: string): boolean {
    const existing = this.findById(id);
    if (!existing) return false;

    this.db.run(`DELETE FROM sites WHERE id = ?`, [id]);
    return true;
  }

  updateStatus(id: string, status: Site["status"], containerId?: string, port?: number): void {
    this.db.run(
      `UPDATE sites SET status = ?, container_id = ?, port = ? WHERE id = ?`,
      [status, containerId || null, port || null, id]
    );
  }

  markDeployed(id: string): void {
    this.db.run(
      `UPDATE sites SET last_deployed_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
  }
}
```

**Step 2: Export from index**

```typescript
// packages/core/src/database/models/index.ts
export * from "./site";
export * from "./process"; // keep existing for now
```

**Step 3: Build and verify**

Run: `bun run build:core`

**Step 4: Commit**

```bash
git add packages/core/src/database/models/
git commit -m "feat: add Site model with CRUD operations"
```

---

### Task 1.3: Create ShareLink Model

**Files:**
- Create: `packages/core/src/database/models/share-link.ts`
- Modify: `packages/core/src/database/models/index.ts`

**Step 1: Write the ShareLink model**

```typescript
// packages/core/src/database/models/share-link.ts
import { Database } from "../database";
import type { ShareLink } from "../schema";
import { randomUUID, randomBytes } from "crypto";

export class ShareLinkModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  create(siteId: string, expiresInHours: number = 24): ShareLink {
    const id = randomUUID();
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

    const link: ShareLink = {
      id,
      site_id: siteId,
      token,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    };

    this.db.run(
      `INSERT INTO share_links (id, site_id, token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [link.id, link.site_id, link.token, link.expires_at, link.created_at]
    );

    return link;
  }

  findByToken(token: string): ShareLink | null {
    const results = this.db.query<ShareLink>(
      `SELECT * FROM share_links WHERE token = ? AND expires_at > datetime('now')`,
      [token]
    );
    return results[0] || null;
  }

  findBySiteId(siteId: string): ShareLink[] {
    return this.db.query<ShareLink>(
      `SELECT * FROM share_links WHERE site_id = ? ORDER BY created_at DESC`,
      [siteId]
    );
  }

  delete(id: string): boolean {
    this.db.run(`DELETE FROM share_links WHERE id = ?`, [id]);
    return true;
  }

  deleteExpired(): number {
    const result = this.db.run(`DELETE FROM share_links WHERE expires_at <= datetime('now')`);
    return 0; // SQLite in Bun doesn't return affected rows easily
  }
}
```

**Step 2: Export from index**

Add to `packages/core/src/database/models/index.ts`:
```typescript
export * from "./share-link";
```

**Step 3: Build and verify**

Run: `bun run build:core`

**Step 4: Commit**

```bash
git add packages/core/src/database/models/
git commit -m "feat: add ShareLink model for temporary site access"
```

---

### Task 1.4: Create Session Model for Auth

**Files:**
- Create: `packages/core/src/database/models/session.ts`
- Modify: `packages/core/src/database/models/index.ts`

**Step 1: Write the Session model**

```typescript
// packages/core/src/database/models/session.ts
import { Database } from "../database";
import type { Session } from "../schema";
import { randomUUID, randomBytes } from "crypto";

export class SessionModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  create(expiresInDays: number = 7): Session {
    const id = randomUUID();
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    const session: Session = {
      id,
      token,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    };

    this.db.run(
      `INSERT INTO sessions (id, token, created_at, expires_at) VALUES (?, ?, ?, ?)`,
      [session.id, session.token, session.created_at, session.expires_at]
    );

    return session;
  }

  findByToken(token: string): Session | null {
    const results = this.db.query<Session>(
      `SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')`,
      [token]
    );
    return results[0] || null;
  }

  delete(token: string): boolean {
    this.db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
    return true;
  }

  deleteExpired(): void {
    this.db.run(`DELETE FROM sessions WHERE expires_at <= datetime('now')`);
  }
}
```

**Step 2: Export from index**

Add to `packages/core/src/database/models/index.ts`:
```typescript
export * from "./session";
```

**Step 3: Build and verify**

Run: `bun run build:core`

**Step 4: Commit**

```bash
git add packages/core/src/database/models/
git commit -m "feat: add Session model for dashboard authentication"
```

---

## Phase 2: SSH Authentication

### Task 2.1: Create SSH Auth Server

**Files:**
- Create: `packages/server/src/auth/ssh-server.ts`
- Create: `packages/server/src/auth/index.ts`

**Step 1: Install ssh2 dependency**

Run: `cd packages/server && bun add ssh2 && bun add -d @types/ssh2`

**Step 2: Write the SSH auth server**

```typescript
// packages/server/src/auth/ssh-server.ts
import { Server, type Connection, type AuthContext } from "ssh2";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { info, debug, error } from "@keithk/deploy-core";
import { SessionModel } from "@keithk/deploy-core";
import { parseKey } from "ssh2";

interface SSHAuthConfig {
  port: number;
  hostKeyPath: string;
  authorizedKeysPath: string;
  dashboardUrl: string;
}

export class SSHAuthServer {
  private server: Server;
  private config: SSHAuthConfig;
  private authorizedKeys: Buffer[] = [];
  private sessionModel: SessionModel;

  constructor(config: SSHAuthConfig) {
    this.config = config;
    this.sessionModel = new SessionModel();
    this.loadAuthorizedKeys();

    this.server = new Server(
      {
        hostKeys: [readFileSync(config.hostKeyPath)],
      },
      this.handleConnection.bind(this)
    );
  }

  private loadAuthorizedKeys(): void {
    if (!existsSync(this.config.authorizedKeysPath)) {
      error(`Authorized keys file not found: ${this.config.authorizedKeysPath}`);
      return;
    }

    const content = readFileSync(this.config.authorizedKeysPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim() && !line.startsWith("#"));

    for (const line of lines) {
      try {
        const parsed = parseKey(line);
        if (parsed && !(parsed instanceof Error)) {
          const key = Array.isArray(parsed) ? parsed[0] : parsed;
          if (key) {
            this.authorizedKeys.push(key.getPublicSSH());
          }
        }
      } catch (e) {
        debug(`Failed to parse key: ${line.substring(0, 50)}...`);
      }
    }

    info(`Loaded ${this.authorizedKeys.length} authorized keys`);
  }

  private handleConnection(client: Connection): void {
    debug("SSH client connected");

    client.on("authentication", (ctx: AuthContext) => {
      if (ctx.method === "publickey") {
        const key = ctx.key;
        const keyBuffer = key.data;

        const isAuthorized = this.authorizedKeys.some((authorizedKey) =>
          authorizedKey.equals(keyBuffer)
        );

        if (isAuthorized) {
          debug(`SSH auth successful for key type: ${key.algo}`);
          ctx.accept();
        } else {
          debug("SSH auth failed: key not in authorized_keys");
          ctx.reject();
        }
      } else {
        ctx.reject(["publickey"]);
      }
    });

    client.on("ready", () => {
      debug("SSH client authenticated");

      client.on("session", (accept) => {
        const session = accept();

        session.on("shell", (accept) => {
          const stream = accept();
          this.handleShellSession(stream, client);
        });

        session.on("exec", (accept, reject, info) => {
          const stream = accept();
          this.handleExecCommand(stream, info.command, client);
        });
      });
    });

    client.on("error", (err) => {
      debug(`SSH client error: ${err.message}`);
    });

    client.on("close", () => {
      debug("SSH client disconnected");
    });
  }

  private handleShellSession(stream: any, client: Connection): void {
    // Create a new session and return login URL
    const session = this.sessionModel.create();
    const loginUrl = `${this.config.dashboardUrl}?token=${session.token}`;

    stream.write("\r\n");
    stream.write("╔══════════════════════════════════════════╗\r\n");
    stream.write("║         Welcome to Deploy                ║\r\n");
    stream.write("╚══════════════════════════════════════════╝\r\n");
    stream.write("\r\n");
    stream.write(`Dashboard: ${loginUrl}\r\n`);
    stream.write("\r\n");
    stream.write("This link is valid for 7 days.\r\n");
    stream.write("\r\n");

    // Close the connection after displaying
    setTimeout(() => {
      stream.exit(0);
      stream.end();
      client.end();
    }, 100);
  }

  private handleExecCommand(stream: any, command: string, client: Connection): void {
    // Handle specific commands if needed
    if (command === "login" || command === "") {
      this.handleShellSession(stream, client);
    } else {
      stream.write(`Unknown command: ${command}\r\n`);
      stream.exit(1);
      stream.end();
      client.end();
    }
  }

  start(): void {
    this.server.listen(this.config.port, () => {
      info(`SSH auth server listening on port ${this.config.port}`);
    });
  }

  stop(): void {
    this.server.close();
  }
}
```

**Step 3: Create index export**

```typescript
// packages/server/src/auth/index.ts
export * from "./ssh-server";
```

**Step 4: Build and verify**

Run: `bun run build:server`

**Step 5: Commit**

```bash
git add packages/server/src/auth/ packages/server/package.json
git commit -m "feat: add SSH authentication server for dashboard access"
```

---

### Task 2.2: Create Auth Middleware for Dashboard

**Files:**
- Create: `packages/server/src/middleware/auth.ts`
- Modify: `packages/server/src/middleware/index.ts`

**Step 1: Write auth middleware**

```typescript
// packages/server/src/middleware/auth.ts
import { SessionModel, ShareLinkModel, SiteModel } from "@keithk/deploy-core";

const sessionModel = new SessionModel();
const shareLinkModel = new ShareLinkModel();
const siteModel = new SiteModel();

export interface AuthResult {
  authenticated: boolean;
  sessionToken?: string;
}

export function getSessionFromRequest(request: Request): string | null {
  // Check cookie
  const cookies = request.headers.get("cookie") || "";
  const sessionMatch = cookies.match(/session=([^;]+)/);
  if (sessionMatch) {
    return sessionMatch[1];
  }

  // Check query param (for initial login from SSH)
  const url = new URL(request.url);
  return url.searchParams.get("token");
}

export function validateSession(token: string | null): boolean {
  if (!token) return false;
  const session = sessionModel.findByToken(token);
  return session !== null;
}

export function requireAuth(request: Request): Response | null {
  const token = getSessionFromRequest(request);
  if (validateSession(token)) {
    return null; // Authenticated, continue
  }

  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Bearer realm="Deploy Dashboard"',
    },
  });
}

export function checkSiteAccess(request: Request, siteName: string): boolean {
  const site = siteModel.findByName(siteName);
  if (!site) return false;

  // Public sites are always accessible
  if (site.visibility === "public") return true;

  // Check session auth
  const sessionToken = getSessionFromRequest(request);
  if (validateSession(sessionToken)) return true;

  // Check share link
  const url = new URL(request.url);
  const shareToken = url.searchParams.get("token");
  if (shareToken) {
    const shareLink = shareLinkModel.findByToken(shareToken);
    if (shareLink && shareLink.site_id === site.id) {
      return true;
    }
  }

  return false;
}

export function createSessionCookie(token: string): string {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return `session=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${expires.toUTCString()}`;
}
```

**Step 2: Export from middleware index**

Add to `packages/server/src/middleware/index.ts`:
```typescript
export * from "./auth";
```

**Step 3: Build and verify**

Run: `bun run build:server`

**Step 4: Commit**

```bash
git add packages/server/src/middleware/
git commit -m "feat: add auth middleware for session validation and site access"
```

---

## Phase 3: Dashboard UI (Web Components + Open Props)

### Task 3.1: Set Up Dashboard Foundation

**Files:**
- Create: `packages/admin/src/index.html`
- Create: `packages/admin/src/styles/main.css`
- Create: `packages/admin/src/app.ts`

**Step 1: Install Open Props**

Run: `cd packages/admin && bun add open-props`

**Step 2: Create the HTML shell**

```html
<!-- packages/admin/src/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deploy</title>
  <link rel="stylesheet" href="https://unpkg.com/open-props">
  <link rel="stylesheet" href="https://unpkg.com/open-props/normalize.min.css">
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <deploy-app></deploy-app>
  <script type="module" src="/app.js"></script>
</body>
</html>
```

**Step 3: Create main styles**

```css
/* packages/admin/src/styles/main.css */
:root {
  --font-mono: "Monaspace Neon", "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace;
  --surface-1: var(--gray-0);
  --surface-2: var(--gray-1);
  --surface-3: var(--gray-2);
  --text-1: var(--gray-9);
  --text-2: var(--gray-7);
  --brand: var(--blue-6);
  --success: var(--green-6);
  --warning: var(--yellow-6);
  --error: var(--red-6);
}

@media (prefers-color-scheme: dark) {
  :root {
    --surface-1: var(--gray-9);
    --surface-2: var(--gray-8);
    --surface-3: var(--gray-7);
    --text-1: var(--gray-0);
    --text-2: var(--gray-3);
  }
}

* {
  font-family: var(--font-mono);
}

body {
  background: var(--surface-1);
  color: var(--text-1);
  margin: 0;
  min-height: 100vh;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--size-4);
}

.card {
  background: var(--surface-2);
  border-radius: var(--radius-2);
  padding: var(--size-4);
}

.btn {
  font-family: var(--font-mono);
  font-size: var(--font-size-0);
  padding: var(--size-2) var(--size-3);
  border-radius: var(--radius-2);
  border: 1px solid var(--surface-3);
  background: var(--surface-2);
  color: var(--text-1);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  background: var(--surface-3);
}

.btn-primary {
  background: var(--brand);
  border-color: var(--brand);
  color: white;
}

.btn-primary:hover {
  filter: brightness(1.1);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot.running { background: var(--success); }
.status-dot.stopped { background: var(--text-2); }
.status-dot.building { background: var(--warning); }
.status-dot.error { background: var(--error); }

input, select {
  font-family: var(--font-mono);
  font-size: var(--font-size-0);
  padding: var(--size-2);
  border-radius: var(--radius-2);
  border: 1px solid var(--surface-3);
  background: var(--surface-1);
  color: var(--text-1);
}

input:focus, select:focus {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
```

**Step 4: Create the main app component**

```typescript
// packages/admin/src/app.ts
class DeployApp extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.innerHTML = `
      <div class="container">
        <deploy-header></deploy-header>
        <main>
          <deploy-sites></deploy-sites>
          <deploy-actions></deploy-actions>
        </main>
      </div>
    `;
  }
}

customElements.define("deploy-app", DeployApp);

// Import other components
import "./components/header";
import "./components/sites";
import "./components/actions";
import "./components/site-card";
import "./components/new-site-modal";
```

**Step 5: Commit**

```bash
git add packages/admin/src/
git commit -m "feat: set up dashboard foundation with Open Props and Web Components"
```

---

### Task 3.2: Create Header Component

**Files:**
- Create: `packages/admin/src/components/header.ts`

**Step 1: Write the header component**

```typescript
// packages/admin/src/components/header.ts
class DeployHeader extends HTMLElement {
  private domain: string = "";

  constructor() {
    super();
  }

  async connectedCallback() {
    await this.loadSettings();
    this.render();
  }

  async loadSettings() {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      this.domain = data.domain || "deploy.local";
    } catch {
      this.domain = "deploy.local";
    }
  }

  render() {
    this.innerHTML = `
      <header class="header">
        <div class="header-left">
          <span class="logo">🌐</span>
          <span class="domain">${this.domain}</span>
        </div>
        <div class="header-right">
          <button class="btn" id="settings-btn">Settings</button>
        </div>
      </header>
      <style>
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--size-4) 0;
          border-bottom: 1px solid var(--surface-3);
          margin-bottom: var(--size-6);
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: var(--size-2);
        }
        .logo {
          font-size: var(--font-size-3);
        }
        .domain {
          font-size: var(--font-size-2);
          font-weight: var(--font-weight-6);
        }
      </style>
    `;
  }
}

customElements.define("deploy-header", DeployHeader);
```

**Step 2: Commit**

```bash
git add packages/admin/src/components/
git commit -m "feat: add header component with domain display"
```

---

### Task 3.3: Create Sites List Component

**Files:**
- Create: `packages/admin/src/components/sites.ts`
- Create: `packages/admin/src/components/site-card.ts`

**Step 1: Write the sites list component**

```typescript
// packages/admin/src/components/sites.ts
import type { Site } from "@keithk/deploy-core";

class DeploySites extends HTMLElement {
  private sites: Site[] = [];
  private loading = true;

  constructor() {
    super();
  }

  async connectedCallback() {
    this.render();
    await this.loadSites();
  }

  async loadSites() {
    this.loading = true;
    this.render();

    try {
      const res = await fetch("/api/sites");
      this.sites = await res.json();
    } catch (e) {
      console.error("Failed to load sites:", e);
      this.sites = [];
    }

    this.loading = false;
    this.render();
    this.attachEventListeners();
  }

  attachEventListeners() {
    const newBtn = this.querySelector("#new-site-btn");
    newBtn?.addEventListener("click", () => this.showNewSiteModal());

    const searchInput = this.querySelector("#search-sites") as HTMLInputElement;
    searchInput?.addEventListener("input", (e) => this.filterSites((e.target as HTMLInputElement).value));
  }

  showNewSiteModal() {
    const modal = document.createElement("deploy-new-site-modal");
    modal.addEventListener("site-created", () => this.loadSites());
    document.body.appendChild(modal);
  }

  filterSites(query: string) {
    const cards = this.querySelectorAll("deploy-site-card");
    const q = query.toLowerCase();
    cards.forEach((card) => {
      const name = card.getAttribute("name")?.toLowerCase() || "";
      (card as HTMLElement).style.display = name.includes(q) ? "" : "none";
    });
  }

  render() {
    this.innerHTML = `
      <section class="sites-section">
        <div class="section-header">
          <h2>SITES</h2>
          <button class="btn btn-primary" id="new-site-btn">+ New</button>
          <input type="text" id="search-sites" placeholder="Search..." class="search-input">
        </div>
        <div class="sites-list">
          ${this.loading ? "<p>Loading...</p>" : ""}
          ${!this.loading && this.sites.length === 0 ? "<p class='empty'>No sites yet. Click + New to add one.</p>" : ""}
          ${this.sites.map((site) => `
            <deploy-site-card
              id="${site.id}"
              name="${site.name}"
              status="${site.status}"
              visibility="${site.visibility}"
              git-url="${site.git_url}"
            ></deploy-site-card>
          `).join("")}
        </div>
      </section>
      <style>
        .sites-section {
          margin-bottom: var(--size-8);
        }
        .section-header {
          display: flex;
          align-items: center;
          gap: var(--size-3);
          margin-bottom: var(--size-4);
        }
        .section-header h2 {
          font-size: var(--font-size-1);
          font-weight: var(--font-weight-6);
          color: var(--text-2);
          margin: 0;
        }
        .search-input {
          margin-left: auto;
          width: 200px;
        }
        .sites-list {
          display: flex;
          flex-direction: column;
          gap: var(--size-2);
        }
        .empty {
          color: var(--text-2);
          font-style: italic;
        }
      </style>
    `;
  }
}

customElements.define("deploy-sites", DeploySites);
```

**Step 2: Write the site card component**

```typescript
// packages/admin/src/components/site-card.ts
class DeploySiteCard extends HTMLElement {
  static get observedAttributes() {
    return ["id", "name", "status", "visibility", "git-url"];
  }

  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
    this.attachEventListeners();
  }

  attributeChangedCallback() {
    this.render();
  }

  get siteId() { return this.getAttribute("id") || ""; }
  get name() { return this.getAttribute("name") || ""; }
  get status() { return this.getAttribute("status") || "stopped"; }
  get visibility() { return this.getAttribute("visibility") || "private"; }
  get gitUrl() { return this.getAttribute("git-url") || ""; }

  attachEventListeners() {
    this.querySelector(".btn-logs")?.addEventListener("click", () => this.showLogs());
    this.querySelector(".btn-redeploy")?.addEventListener("click", () => this.redeploy());
    this.querySelector(".btn-menu")?.addEventListener("click", (e) => this.toggleMenu(e));
  }

  async redeploy() {
    const btn = this.querySelector(".btn-redeploy") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Deploying...";

    try {
      await fetch(`/api/sites/${this.siteId}/deploy`, { method: "POST" });
      // Refresh parent list
      this.dispatchEvent(new CustomEvent("site-updated", { bubbles: true }));
    } catch (e) {
      console.error("Deploy failed:", e);
    }

    btn.disabled = false;
    btn.textContent = "Redeploy";
  }

  showLogs() {
    // TODO: implement logs modal
    console.log("Show logs for", this.name);
  }

  toggleMenu(e: Event) {
    e.stopPropagation();
    const menu = this.querySelector(".dropdown-menu") as HTMLElement;
    menu.classList.toggle("show");
  }

  render() {
    const domain = "keith.business"; // TODO: get from settings
    const siteUrl = `https://${this.name}.${domain}`;

    this.innerHTML = `
      <div class="site-card card">
        <span class="status-dot ${this.status}"></span>
        <span class="site-name">${this.name}</span>
        <a href="${siteUrl}" target="_blank" class="site-url">${this.name}.${domain}</a>
        <div class="site-actions">
          <button class="btn btn-logs">Logs</button>
          <button class="btn btn-redeploy">${this.status === "stopped" ? "Start" : "Redeploy"}</button>
          <div class="dropdown">
            <button class="btn btn-menu">⋮</button>
            <div class="dropdown-menu">
              <a href="${siteUrl}" target="_blank">View Site</a>
              <button class="menu-item" data-action="env">Environment</button>
              <button class="menu-item" data-action="share">Share Link</button>
              <button class="menu-item danger" data-action="delete">Delete</button>
            </div>
          </div>
        </div>
      </div>
      <style>
        .site-card {
          display: flex;
          align-items: center;
          gap: var(--size-3);
          padding: var(--size-3) var(--size-4);
        }
        .site-name {
          font-weight: var(--font-weight-6);
          min-width: 150px;
        }
        .site-url {
          color: var(--text-2);
          text-decoration: none;
          flex: 1;
        }
        .site-url:hover {
          color: var(--brand);
        }
        .site-actions {
          display: flex;
          gap: var(--size-2);
        }
        .dropdown {
          position: relative;
        }
        .dropdown-menu {
          display: none;
          position: absolute;
          right: 0;
          top: 100%;
          background: var(--surface-2);
          border: 1px solid var(--surface-3);
          border-radius: var(--radius-2);
          min-width: 150px;
          z-index: 100;
        }
        .dropdown-menu.show {
          display: block;
        }
        .dropdown-menu a,
        .dropdown-menu button {
          display: block;
          width: 100%;
          padding: var(--size-2) var(--size-3);
          text-align: left;
          background: none;
          border: none;
          color: var(--text-1);
          cursor: pointer;
          text-decoration: none;
        }
        .dropdown-menu a:hover,
        .dropdown-menu button:hover {
          background: var(--surface-3);
        }
        .dropdown-menu .danger {
          color: var(--error);
        }
      </style>
    `;
  }
}

customElements.define("deploy-site-card", DeploySiteCard);
```

**Step 3: Commit**

```bash
git add packages/admin/src/components/
git commit -m "feat: add sites list and site card components"
```

---

### Task 3.4: Create New Site Modal

**Files:**
- Create: `packages/admin/src/components/new-site-modal.ts`

**Step 1: Write the modal component**

```typescript
// packages/admin/src/components/new-site-modal.ts
class DeployNewSiteModal extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
    this.attachEventListeners();
  }

  attachEventListeners() {
    this.querySelector(".modal-backdrop")?.addEventListener("click", () => this.close());
    this.querySelector(".btn-cancel")?.addEventListener("click", () => this.close());
    this.querySelector("form")?.addEventListener("submit", (e) => this.handleSubmit(e));

    // Auto-suggest subdomain from git URL
    const gitInput = this.querySelector("#git-url") as HTMLInputElement;
    const subdomainInput = this.querySelector("#subdomain") as HTMLInputElement;

    gitInput?.addEventListener("input", () => {
      const url = gitInput.value;
      const match = url.match(/\/([^\/]+?)(\.git)?$/);
      if (match && !subdomainInput.value) {
        subdomainInput.value = match[1].toLowerCase().replace(/[^a-z0-9-]/g, "-");
      }
    });
  }

  close() {
    this.remove();
  }

  async handleSubmit(e: Event) {
    e.preventDefault();

    const form = e.target as HTMLFormElement;
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    const gitUrl = (form.querySelector("#git-url") as HTMLInputElement).value;
    const subdomain = (form.querySelector("#subdomain") as HTMLInputElement).value;

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating...";

    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ git_url: gitUrl, name: subdomain }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create site");
      }

      this.dispatchEvent(new CustomEvent("site-created", { bubbles: true }));
      this.close();
    } catch (e) {
      alert((e as Error).message);
      submitBtn.disabled = false;
      submitBtn.textContent = "Create";
    }
  }

  render() {
    this.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal">
        <h2>New Site</h2>
        <form>
          <div class="form-group">
            <label for="git-url">Git URL</label>
            <input type="text" id="git-url" placeholder="github.com/user/repo" required>
          </div>
          <div class="form-group">
            <label for="subdomain">Subdomain</label>
            <div class="subdomain-input">
              <input type="text" id="subdomain" placeholder="my-site" required pattern="[a-z0-9-]+">
              <span class="domain-suffix">.keith.business</span>
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Create</button>
          </div>
        </form>
      </div>
      <style>
        :host {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
        }
        .modal {
          position: relative;
          background: var(--surface-2);
          border-radius: var(--radius-3);
          padding: var(--size-6);
          width: 100%;
          max-width: 450px;
        }
        .modal h2 {
          margin: 0 0 var(--size-5) 0;
        }
        .form-group {
          margin-bottom: var(--size-4);
        }
        .form-group label {
          display: block;
          margin-bottom: var(--size-2);
          color: var(--text-2);
          font-size: var(--font-size-0);
        }
        .form-group input {
          width: 100%;
          box-sizing: border-box;
        }
        .subdomain-input {
          display: flex;
          align-items: center;
        }
        .subdomain-input input {
          flex: 1;
          border-top-right-radius: 0;
          border-bottom-right-radius: 0;
        }
        .domain-suffix {
          background: var(--surface-3);
          padding: var(--size-2);
          border: 1px solid var(--surface-3);
          border-left: none;
          border-top-right-radius: var(--radius-2);
          border-bottom-right-radius: var(--radius-2);
          color: var(--text-2);
          font-size: var(--font-size-0);
        }
        .form-actions {
          display: flex;
          gap: var(--size-2);
          justify-content: flex-end;
          margin-top: var(--size-5);
        }
      </style>
    `;
  }
}

customElements.define("deploy-new-site-modal", DeployNewSiteModal);
```

**Step 2: Commit**

```bash
git add packages/admin/src/components/
git commit -m "feat: add new site modal with git URL input and subdomain auto-suggest"
```

---

## Phase 4: API Endpoints

### Task 4.1: Create Sites API

**Files:**
- Create: `packages/server/src/api/sites.ts`
- Modify: `packages/server/src/api/handlers.ts`

**Step 1: Write sites API handlers**

```typescript
// packages/server/src/api/sites.ts
import { SiteModel, ShareLinkModel } from "@keithk/deploy-core";
import { requireAuth } from "../middleware/auth";

const siteModel = new SiteModel();
const shareLinkModel = new ShareLinkModel();

export async function handleSitesApi(request: Request, path: string): Promise<Response | null> {
  const authError = requireAuth(request);
  if (authError) return authError;

  const method = request.method;
  const segments = path.split("/").filter(Boolean); // ["sites", ...]

  // GET /api/sites
  if (method === "GET" && segments.length === 1) {
    const sites = siteModel.findAll();
    return Response.json(sites);
  }

  // POST /api/sites
  if (method === "POST" && segments.length === 1) {
    const body = await request.json();
    const { git_url, name } = body;

    if (!git_url || !name) {
      return Response.json({ error: "git_url and name are required" }, { status: 400 });
    }

    // Check if name is already taken
    if (siteModel.findByName(name)) {
      return Response.json({ error: "Site name already exists" }, { status: 409 });
    }

    const site = siteModel.create({ git_url, name, type: "auto", visibility: "private", env_vars: "{}" });

    // TODO: Trigger initial deployment

    return Response.json(site, { status: 201 });
  }

  // GET /api/sites/:id
  if (method === "GET" && segments.length === 2) {
    const site = siteModel.findById(segments[1]);
    if (!site) {
      return Response.json({ error: "Site not found" }, { status: 404 });
    }
    return Response.json(site);
  }

  // PATCH /api/sites/:id
  if (method === "PATCH" && segments.length === 2) {
    const body = await request.json();
    const site = siteModel.update(segments[1], body);
    if (!site) {
      return Response.json({ error: "Site not found" }, { status: 404 });
    }
    return Response.json(site);
  }

  // DELETE /api/sites/:id
  if (method === "DELETE" && segments.length === 2) {
    const deleted = siteModel.delete(segments[1]);
    if (!deleted) {
      return Response.json({ error: "Site not found" }, { status: 404 });
    }
    return new Response(null, { status: 204 });
  }

  // POST /api/sites/:id/deploy
  if (method === "POST" && segments.length === 3 && segments[2] === "deploy") {
    const site = siteModel.findById(segments[1]);
    if (!site) {
      return Response.json({ error: "Site not found" }, { status: 404 });
    }

    // TODO: Trigger deployment
    siteModel.updateStatus(site.id, "building");

    return Response.json({ message: "Deployment started" });
  }

  // POST /api/sites/:id/share
  if (method === "POST" && segments.length === 3 && segments[2] === "share") {
    const site = siteModel.findById(segments[1]);
    if (!site) {
      return Response.json({ error: "Site not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const hours = body.hours || 24;
    const link = shareLinkModel.create(site.id, hours);

    const domain = process.env.PROJECT_DOMAIN || "deploy.local";
    const shareUrl = `https://${site.name}.${domain}?token=${link.token}`;

    return Response.json({ url: shareUrl, expires_at: link.expires_at });
  }

  return null; // Not handled
}
```

**Step 2: Integrate into handlers**

Modify `packages/server/src/api/handlers.ts` to route to sites API.

**Step 3: Build and verify**

Run: `bun run build:server`

**Step 4: Commit**

```bash
git add packages/server/src/api/
git commit -m "feat: add sites API with CRUD and deploy endpoints"
```

---

## Phase 5: Git-based Deployment

### Task 5.1: Create Git Clone Service

**Files:**
- Create: `packages/server/src/services/git.ts`

**Step 1: Write git service**

```typescript
// packages/server/src/services/git.ts
import { $ } from "bun";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { info, debug, error } from "@keithk/deploy-core";

const SITES_DIR = process.env.SITES_DIR || "/var/deploy/sites";

export async function cloneSite(gitUrl: string, name: string, branch: string = "main"): Promise<string> {
  const sitePath = join(SITES_DIR, name);

  if (!existsSync(SITES_DIR)) {
    mkdirSync(SITES_DIR, { recursive: true });
  }

  if (existsSync(sitePath)) {
    info(`Site directory exists, pulling latest: ${sitePath}`);
    await $`git -C ${sitePath} fetch origin ${branch}`.quiet();
    await $`git -C ${sitePath} reset --hard origin/${branch}`.quiet();
  } else {
    info(`Cloning ${gitUrl} to ${sitePath}`);
    await $`git clone --branch ${branch} --single-branch ${gitUrl} ${sitePath}`.quiet();
  }

  return sitePath;
}

export async function pullSite(name: string, branch: string = "main"): Promise<void> {
  const sitePath = join(SITES_DIR, name);

  if (!existsSync(sitePath)) {
    throw new Error(`Site directory does not exist: ${sitePath}`);
  }

  debug(`Pulling latest for ${name}`);
  await $`git -C ${sitePath} fetch origin ${branch}`.quiet();
  await $`git -C ${sitePath} reset --hard origin/${branch}`.quiet();
}

export function getSitePath(name: string): string {
  return join(SITES_DIR, name);
}
```

**Step 2: Commit**

```bash
git add packages/server/src/services/
git commit -m "feat: add git clone/pull service for site deployments"
```

---

### Task 5.2: Create Railpacks Build Service

**Files:**
- Create: `packages/server/src/services/railpacks.ts`

**Step 1: Write railpacks service**

```typescript
// packages/server/src/services/railpacks.ts
import { $ } from "bun";
import { info, debug, error } from "@keithk/deploy-core";

export interface BuildResult {
  success: boolean;
  imageName: string;
  error?: string;
}

export async function buildWithRailpacks(sitePath: string, siteName: string): Promise<BuildResult> {
  const imageName = `deploy-${siteName}:latest`;

  try {
    info(`Building ${siteName} with Railpacks...`);

    // Run railpacks build
    const result = await $`railpacks build ${sitePath} --name ${imageName}`.quiet();

    if (result.exitCode !== 0) {
      throw new Error(`Railpacks build failed: ${result.stderr}`);
    }

    info(`Successfully built image: ${imageName}`);
    return { success: true, imageName };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    error(`Build failed for ${siteName}: ${message}`);
    return { success: false, imageName, error: message };
  }
}

export async function detectSiteType(sitePath: string): Promise<"auto" | "passthrough"> {
  // Railpacks handles detection, but we might want to check for specific markers
  // For now, always return "auto" and let Railpacks figure it out
  return "auto";
}
```

**Step 2: Commit**

```bash
git add packages/server/src/services/
git commit -m "feat: add Railpacks build service"
```

---

### Task 5.3: Create Container Manager Service

**Files:**
- Create: `packages/server/src/services/container.ts`

**Step 1: Write container manager**

```typescript
// packages/server/src/services/container.ts
import { $ } from "bun";
import { info, debug, error } from "@keithk/deploy-core";

let nextPort = 8000;

export interface ContainerInfo {
  containerId: string;
  port: number;
}

export async function startContainer(imageName: string, siteName: string, envVars: Record<string, string> = {}): Promise<ContainerInfo> {
  const port = nextPort++;
  const containerName = `deploy-${siteName}`;

  // Stop existing container if running
  await stopContainer(siteName);

  // Build env var args
  const envArgs: string[] = [];
  envArgs.push("-e", `PORT=${port}`);
  for (const [key, value] of Object.entries(envVars)) {
    envArgs.push("-e", `${key}=${value}`);
  }

  info(`Starting container ${containerName} on port ${port}`);

  const result = await $`docker run -d --name ${containerName} -p ${port}:${port} ${envArgs} ${imageName}`.quiet();

  if (result.exitCode !== 0) {
    throw new Error(`Failed to start container: ${result.stderr}`);
  }

  const containerId = result.stdout.toString().trim();
  return { containerId, port };
}

export async function stopContainer(siteName: string): Promise<void> {
  const containerName = `deploy-${siteName}`;

  try {
    await $`docker stop ${containerName}`.quiet();
    await $`docker rm ${containerName}`.quiet();
    debug(`Stopped and removed container: ${containerName}`);
  } catch {
    // Container might not exist, ignore
  }
}

export async function getContainerLogs(siteName: string, lines: number = 100): Promise<string> {
  const containerName = `deploy-${siteName}`;

  try {
    const result = await $`docker logs --tail ${lines} ${containerName}`.quiet();
    return result.stdout.toString();
  } catch {
    return "";
  }
}

export async function isContainerRunning(siteName: string): Promise<boolean> {
  const containerName = `deploy-${siteName}`;

  try {
    const result = await $`docker inspect -f '{{.State.Running}}' ${containerName}`.quiet();
    return result.stdout.toString().trim() === "true";
  } catch {
    return false;
  }
}
```

**Step 2: Commit**

```bash
git add packages/server/src/services/
git commit -m "feat: add container manager service for Docker lifecycle"
```

---

### Task 5.4: Create Deploy Orchestrator

**Files:**
- Create: `packages/server/src/services/deploy.ts`

**Step 1: Write deploy orchestrator that ties git, railpacks, and container together**

```typescript
// packages/server/src/services/deploy.ts
import { SiteModel } from "@keithk/deploy-core";
import { cloneSite, pullSite, getSitePath } from "./git";
import { buildWithRailpacks } from "./railpacks";
import { startContainer, stopContainer } from "./container";
import { info, error } from "@keithk/deploy-core";

const siteModel = new SiteModel();

export async function deploySite(siteId: string): Promise<{ success: boolean; error?: string }> {
  const site = siteModel.findById(siteId);
  if (!site) {
    return { success: false, error: "Site not found" };
  }

  try {
    // Update status to building
    siteModel.updateStatus(siteId, "building");
    info(`Starting deployment for ${site.name}`);

    // Step 1: Clone or pull
    const sitePath = await cloneSite(site.git_url, site.name, site.branch);

    // Step 2: Build with Railpacks
    const buildResult = await buildWithRailpacks(sitePath, site.name);
    if (!buildResult.success) {
      siteModel.updateStatus(siteId, "error");
      return { success: false, error: buildResult.error };
    }

    // Step 3: Start container
    const envVars = JSON.parse(site.env_vars || "{}");
    const containerInfo = await startContainer(buildResult.imageName, site.name, envVars);

    // Step 4: Update site status
    siteModel.updateStatus(siteId, "running", containerInfo.containerId, containerInfo.port);
    siteModel.markDeployed(siteId);

    info(`Successfully deployed ${site.name} on port ${containerInfo.port}`);
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    error(`Deployment failed for ${site.name}: ${message}`);
    siteModel.updateStatus(siteId, "error");
    return { success: false, error: message };
  }
}

export async function stopSite(siteId: string): Promise<void> {
  const site = siteModel.findById(siteId);
  if (!site) return;

  await stopContainer(site.name);
  siteModel.updateStatus(siteId, "stopped", null, null);
}
```

**Step 2: Commit**

```bash
git add packages/server/src/services/
git commit -m "feat: add deploy orchestrator connecting git, railpacks, and container"
```

---

## Phase 6: Routing & Site Serving

### Task 6.1: Update Subdomain Router for Database-backed Sites

**Files:**
- Modify: `packages/server/src/routing/subdomainRouter.ts`

**Step 1: Update router to use database instead of filesystem discovery**

The router needs to:
1. Look up site by subdomain in database
2. Check visibility and auth
3. Proxy to container port

**Step 2: Commit after implementation**

---

### Task 6.2: Update Caddy Config Generation

**Files:**
- Modify: `packages/core/src/utils/caddyfile.ts`

**Step 1: Update Caddy config to route all subdomains to deploy server**

The Caddy config should be simpler now - just wildcard subdomain routing to the deploy server, which handles the rest.

**Step 2: Commit after implementation**

---

## Phase 7: CLI Simplification

### Task 7.1: Simplify CLI to Admin Commands Only

**Files:**
- Modify: `packages/cli/src/commands/index.ts`
- Remove: `packages/cli/src/commands/site.ts`
- Remove: `packages/cli/src/commands/processes.ts`

**Step 1: Keep only setup, start, and doctor commands**

**Step 2: Commit**

---

## Phase 8: Actions System Refinement

### Task 8.1: Update Actions to Use New Database

**Files:**
- Modify: `packages/server/src/actions/registry.ts`
- Modify: `packages/server/src/actions/scheduler.ts`

**Step 1: Actions should be stored in database, not discovered from filesystem**

**Step 2: Add API endpoints for action CRUD**

**Step 3: Commit**

---

## Phase 9: Integration & Testing

### Task 9.1: End-to-End Test on Local

1. Run `bun run setup:local`
2. Start server: `bun run dev`
3. Open dashboard
4. Create a new site with git URL
5. Verify it deploys and is accessible

### Task 9.2: Deploy to Test Server

1. Set up fresh DigitalOcean droplet
2. Point `keith.business` DNS to droplet
3. Run setup
4. Verify SSH auth works
5. Verify site deployment works

---

## Completion Checklist

- [ ] Phase 1: Database schema and models
- [ ] Phase 2: SSH authentication
- [ ] Phase 3: Dashboard UI
- [ ] Phase 4: API endpoints
- [ ] Phase 5: Git-based deployment
- [ ] Phase 6: Routing updates
- [ ] Phase 7: CLI simplification
- [ ] Phase 8: Actions refinement
- [ ] Phase 9: Integration testing
