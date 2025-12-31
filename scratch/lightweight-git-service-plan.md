# Lightweight Git Service Plan - $5 Droplet Edition

## Problem Statement
- Git PATH failures preventing container restarts (`posix_spawn 'git'` errors)
- Need Git branches to persist through container restarts
- Support for 10-20 sites max, with 3-5 being Dockerized
- Keep it simple and cheap ($5-10/month)

## Solution: Lightweight Gogs Setup

### Why Gogs?
- **Tiny**: 64MB RAM footprint
- **Simple**: Single binary, minimal config
- **Cheap**: Runs on $5 Digital Ocean droplet
- **Sufficient**: Perfect for 10-20 sites with 2 edit branches each
- **Reliable**: Battle-tested for small deployments

## Architecture

```
┌─────────────────────────────────────────┐
│           Caddy (existing)              │
│  *.dev.deploy → Site Containers         │
│  git.dev.deploy → Gogs Service          │
└─────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
┌───────▼─────┐ ┌───▼────┐ ┌───▼──────────┐
│Site Container│ │  Gogs  │ │ SQLite (keep)│
│- git clone   │ │- Repos │ │- Sessions    │
│- bun dev     │ │- 64MB  │ │- Users       │
│- Dockerfile  │ │- Simple│ │- Branches    │
└─────────────┘ └────────┘ └──────────────┘
```

## Implementation Plan

### Phase 1: Basic Gogs Setup (Week 1)
**Deploy Gogs Service**
```yaml
# docker-compose.yml addition
gogs:
  image: gogs/gogs:0.13
  container_name: deploy-gogs
  restart: unless-stopped
  ports:
    - "3001:3000"  # HTTP
    - "2222:22"    # SSH (optional)
  volumes:
    - ./data/gogs:/data
  environment:
    - USER_UID=1000
    - USER_GID=1000
```

**Caddy Update**
```caddyfile
# Add to existing Caddyfile
git.dev.deploy {
  tls /path/to/ssl.crt /path/to/ssl.key
  reverse_proxy localhost:3001
}
```

### Phase 2: Simple Git Client (Week 1-2)
**Basic TypeScript client - no enterprise complexity**

```typescript
// packages/server/src/services/simple-git-client.ts
export class SimpleGogsClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  // Just the basics we need
  async createRepo(siteName: string): Promise<{clone_url: string}> {
    // POST /api/v1/repos
  }
  
  async createBranch(siteName: string, branchName: string): Promise<void> {
    // POST /api/v1/repos/{owner}/{repo}/branches
  }
  
  async deleteBranch(siteName: string, branchName: string): Promise<void> {
    // DELETE /api/v1/repos/{owner}/{repo}/branches/{branch}
  }
  
  async deleteRepo(siteName: string): Promise<void> {
    // DELETE /api/v1/repos/{owner}/{repo}
  }
}
```

### Phase 3: Fix Container Git Operations (Week 2)
**Replace direct Git commands with Gogs cloning**

```typescript
// Update packages/server/src/services/editing-session-manager.ts
async startPreviewContainer(session: EditingSession, sitePath: string): Promise<void> {
  const containerName = `${session.branchName}-${session.siteName}-preview`;
  
  // Instead of git checkout locally, clone from Gogs
  const gitCloneUrl = `https://git.dev.deploy/${session.siteName}.git`;
  
  const previewSiteConfig: SiteConfig = {
    subdomain: `${session.branchName}-${session.siteName}`,
    path: sitePath,
    type: 'passthrough',
    proxyPort: previewPort,
    useContainers: true,
    gitBranch: session.branchName,      // NEW
    gitCloneUrl: gitCloneUrl            // NEW
  };
  
  // Container will clone from Gogs instead of local git operations
  await containerManager.instance.createContainer(previewSiteConfig, 'preview');
}
```

**Update container startup to clone from Gogs**
```bash
#!/bin/bash
# container-scripts/git-clone-start.sh

set -e

if [ -n "$GIT_CLONE_URL" ] && [ -n "$GIT_BRANCH" ]; then
  echo "Cloning from Git service..."
  git clone --branch $GIT_BRANCH --single-branch $GIT_CLONE_URL /app/src
  cd /app/src
else
  echo "Using local files..."
  cd /app
fi

echo "Installing dependencies..."
bun install

echo "Starting dev server..."
bun run dev --host 0.0.0.0 --port 3000
```

### Phase 4: Simple File Operations (Week 2-3)
**File saves go to Gogs instead of local filesystem**

```typescript
// Update packages/cli/src/editor/routes/files.ts - file save handler
fileRoutes.put('/sites/:sitename/file/:filepath{.+}', async (c) => {
  const user = c.get('user');
  const siteName = c.req.param('sitename');
  const filepath = c.req.param('filepath');
  const { content } = await c.req.json();
  
  // Check if user has active editing session
  const activeSession = await editingSessionManager.getActiveSession(user.id, siteName);
  
  if (activeSession) {
    // Save to Git branch via Gogs API instead of local file
    await gogsClient.updateFile(
      siteName, 
      filepath, 
      content, 
      activeSession.branchName,
      `Update ${filepath}`
    );
    
    // Restart container (will pull latest changes)
    await editingSessionManager.restartPreviewContainer(activeSession.id);
  } else {
    // Fallback to local file save for non-Git sites
    await writeFile(fullPath, content, 'utf-8');
  }
  
  return c.json({ success: true });
});
```

## Resource Planning (Realistic Scale)

### $5 Digital Ocean Droplet (1GB RAM, 25GB disk)
- **Gogs**: 64MB RAM, 1GB disk
- **5 Docker containers**: 500MB RAM, 5GB disk  
- **OS + Caddy + Node**: 300MB RAM, 2GB disk
- **Build cache**: 10GB disk
- **Buffer**: ~100MB RAM, 7GB disk

**Total: ~900MB RAM, ~18GB disk = plenty of headroom**

### Scaling Path
- **10 sites**: Same droplet works fine
- **20 sites**: Upgrade to $12 droplet (2GB RAM)
- **50+ sites**: Consider $24 droplet or separate Git server

## Benefits of This Simple Approach

1. **Fixes PATH issues**: No more `spawn('git')` in containers
2. **Cheap to start**: $5/month gets you going
3. **Simple to maintain**: One Gogs container + existing setup
4. **Room to grow**: Can handle 20 sites easily
5. **No over-engineering**: Just solves the actual problem

## Migration Strategy

### Week 1: Setup
- Deploy Gogs service alongside existing system
- Create basic TypeScript client
- Test with one site manually

### Week 2: Integration  
- Update container startup scripts
- Modify file save handler
- Test edit → save → restart workflow

### Week 3: Production
- Migrate existing sites to Gogs repos
- Update session management
- Add cleanup for old branches

### Rollback Plan
- Keep local Git repos during transition
- Can disable Gogs integration if issues
- Zero risk to existing sites

## Cost Analysis

**Monthly Costs:**
- $5 Digital Ocean droplet
- Domain + SSL (existing)
- **Total: $5/month**

**Development Time:**
- 2-3 weeks for full implementation
- Much simpler than enterprise Git service
- Focus on just fixing the container restart issue

This approach solves the core problem (Git PATH failures) with minimal complexity and cost, while providing a clear path to scale as needed.