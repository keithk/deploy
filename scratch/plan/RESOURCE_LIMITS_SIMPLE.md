# Simple User-Level Resource Management

## Overview
Implement straightforward per-user resource limits without organizational complexity. Designed for friend groups sharing a server, not enterprise multi-tenancy.

## User-Level Resource Model

### Simple User Structure
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT,
    
    -- Resource Limits (set by admin)
    max_sites INTEGER DEFAULT 3,
    max_memory_mb INTEGER DEFAULT 512,
    max_cpu_cores REAL DEFAULT 0.5,
    max_storage_mb INTEGER DEFAULT 1024,
    max_dev_containers INTEGER DEFAULT 2,  -- NEW: Editor dev containers
    
    -- Current Usage (calculated)
    current_sites INTEGER DEFAULT 0,
    current_memory_mb INTEGER DEFAULT 0,
    current_cpu_usage REAL DEFAULT 0.0,
    current_storage_mb INTEGER DEFAULT 0,
    current_dev_containers INTEGER DEFAULT 0,  -- NEW: Active dev containers
    
    -- Self-service capabilities
    can_create_sites BOOLEAN DEFAULT 1,
    can_use_editor BOOLEAN DEFAULT 1,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
);
```

### User Sites Tracking
```sql
CREATE TABLE user_sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    domain TEXT NOT NULL,
    container_id TEXT,
    dev_container_id TEXT,     -- NEW: Development container
    
    -- Resource Allocation
    allocated_memory_mb INTEGER,
    allocated_cpu_cores REAL,
    dev_allocated_memory_mb INTEGER, -- NEW: Dev container memory
    storage_used_mb INTEGER DEFAULT 0,
    
    status TEXT DEFAULT 'active', -- active, stopped, failed, editing
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_deployed DATETIME,
    last_edited DATETIME,      -- NEW: Last editor activity
    
    UNIQUE(user_id, domain)
);
```

## Resource Limit Types

### 1. Site Count Limits
**Default**: 3 sites per user
**Rationale**: Prevents one user from creating dozens of test sites
**Enforcement**: Check count before allowing new deployments

### 2. Development Container Limits
**Default**: 2 active dev containers per user
**Rationale**: Editor creates additional containers for live editing
**Enforcement**: Limit concurrent editing sessions per user

### 3. Memory Limits (Per User Total)
**Default**: 512MB per user across all their sites + 512MB for dev containers
**Rationale**: Code editor requires additional memory for development
**Enforcement**: Sum all user's containers (prod + dev), reject if over limit

### 4. CPU Limits (Per User Total)
**Default**: 0.5 CPU cores per user across all sites + 0.3 cores for dev
**Rationale**: Development containers need CPU for file watching and hot reload
**Enforcement**: Docker CPU limits on containers

### 5. Storage Limits (Per User Total)
**Default**: 1GB per user for production sites + 1GB for dev workspaces
**Rationale**: Development workspaces need space for node_modules, builds
**Enforcement**: Check disk usage before deployments and editor sessions

## Admin Resource Management

### Default User Templates
```javascript
const USER_TEMPLATES = {
  basic: {
    max_sites: 2,
    max_memory_mb: 256,
    max_cpu_cores: 0.25,
    max_storage_mb: 512,
    max_dev_containers: 1,
    can_use_editor: true
  },
  standard: {
    max_sites: 3,
    max_memory_mb: 512,
    max_cpu_cores: 0.5,
    max_storage_mb: 1024,
    max_dev_containers: 2,
    can_use_editor: true
  },
  power: {
    max_sites: 5,
    max_memory_mb: 1024,
    max_cpu_cores: 1.0,
    max_storage_mb: 2048,
    max_dev_containers: 3,
    can_use_editor: true
  },
  editor_only: {
    max_sites: 1,
    max_memory_mb: 256,
    max_cpu_cores: 0.25,
    max_storage_mb: 512,
    max_dev_containers: 1,
    can_use_editor: true
  }
};
```

### Admin Interface Features
- **User Resource Overview**: See all users and their usage
- **Quick Limit Adjustments**: Drag sliders to change user limits
- **Resource Alerts**: Warn when server approaching capacity
- **Usage Analytics**: Track resource trends over time

## Resource Enforcement

### Pre-Deployment Checks
```javascript
async function canUserDeploy(userId, estimatedResources) {
  const user = await getUser(userId);
  const currentUsage = await getCurrentUsage(userId);
  
  const checks = [
    currentUsage.sites < user.max_sites,
    (currentUsage.memory + estimatedResources.memory) <= user.max_memory_mb,
    (currentUsage.storage + estimatedResources.storage) <= user.max_storage_mb
  ];
  
  return checks.every(check => check);
}

// NEW: Check if user can start development container
async function canUserEdit(userId, siteId) {
  const user = await getUser(userId);
  const currentUsage = await getCurrentUsage(userId);
  
  const checks = [
    user.can_use_editor,
    currentUsage.dev_containers < user.max_dev_containers,
    (currentUsage.memory + 512) <= user.max_memory_mb  // Dev container uses 512MB
  ];
  
  return checks.every(check => check);
}
```

### Runtime Monitoring
- **Every 5 minutes**: Update current usage stats
- **Container limits**: Enforce CPU/memory at Docker level
- **Storage monitoring**: Check disk usage of user directories
- **Graceful degradation**: Stop oldest sites if user exceeds limits

### Limit Exceeded Handling
1. **Soft limits**: Show warnings, allow temporary overages
2. **Hard limits**: Reject new deployments
3. **Emergency limits**: Auto-stop sites if server resources critical
4. **User notifications**: Email warnings about approaching limits

## User Experience

### Resource Visibility
```bash
# Users can see their own limits
deploy status --resources

Your Resource Usage:
Sites: 2/3 (66%)
Memory: 384MB/512MB (75%)
Dev Containers: 1/2 (50%)
Storage: 756MB/2GB (38%)
├── Production: 256MB/1GB
└── Development: 500MB/1GB
CPU: 0.3/0.8 cores (38%)
├── Production: 0.2/0.5 cores
└── Development: 0.1/0.3 cores
```

### Friendly Error Messages
```
❌ Cannot deploy: You've reached your site limit (3/3)
💡 Contact admin to increase your limits or remove an old site

❌ Cannot deploy: Not enough memory available (need 256MB, have 128MB)
💡 Try stopping unused sites or ask admin for more memory

❌ Cannot start editor: You've reached your dev container limit (2/2)
💡 Close other editor sessions or ask admin for more dev containers

❌ Cannot create site: Editor access disabled for your account
💡 Contact admin to enable editor access
```

## Code Editor Resource Considerations\n\n### Development Container Resource Profile\n```javascript\nconst DEV_CONTAINER_RESOURCES = {\n  base_memory: '512MB',      // Higher than production for dev tools\n  base_cpu: '0.3 cores',     // CPU for file watching, hot reload\n  storage_overhead: '200MB', // node_modules, temp files, caches\n  network_isolation: true,   // Separate docker network\n  file_watcher_limit: 8192,  // Max files to watch for changes\n  idle_timeout: 1800000      // 30 minutes before auto-shutdown\n};\n```\n\n### Editor Session Management\n- **Session Limits**: Track active editor sessions per user\n- **Auto-cleanup**: Close idle dev containers after timeout\n- **Resource Prioritization**: Production containers get priority over dev\n- **File Sync Limits**: Limit file size and frequency of sync operations\n\n### Template Resource Requirements\n```javascript\nconst TEMPLATE_RESOURCES = {\n  static: {\n    dev_memory: '256MB',  // Simple file serving\n    dev_cpu: '0.1 cores'\n  },\n  astro: {\n    dev_memory: '512MB',  // Astro dev server + hot reload\n    dev_cpu: '0.25 cores'\n  },\n  next: {\n    dev_memory: '768MB',  // Next.js dev server + fast refresh\n    dev_cpu: '0.3 cores'\n  },\n  node: {\n    dev_memory: '512MB',  // Node.js app with nodemon\n    dev_cpu: '0.2 cores'\n  }\n};\n```\n\n## System Resource Monitoring"}

### Server-Level Tracking
```sql
CREATE TABLE system_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    total_memory_mb INTEGER,
    used_memory_mb INTEGER,
    total_cpu_cores REAL,
    used_cpu_cores REAL,
    total_storage_mb INTEGER,
    used_storage_mb INTEGER,
    
    active_containers INTEGER,
    active_users INTEGER
);
```

### Resource Allocation Strategy
- **Reserve 20%**: Keep 20% of resources free for system overhead
- **Fair sharing**: Divide remaining 80% among active users
- **Burst allowance**: Allow temporary overages during low usage
- **Automatic scaling**: Suggest server upgrades when consistently near limits

## Implementation Priorities

### Phase 1: Basic Limits + Self-Service
- [ ] User resource columns in database (including dev containers)
- [ ] Simple limit checking before deployments
- [ ] Admin interface to set user limits
- [ ] Basic usage tracking
- [ ] User registration/login system
- [ ] Self-service site creation

### Phase 2: Code Editor + Development Containers
- [ ] CodeMirror 6 integration
- [ ] Development container management
- [ ] File sync via WebSocket
- [ ] Hot reload functionality
- [ ] Site template system
- [ ] Dev container resource limits

### Phase 3: Real-time Monitoring
- [ ] Container resource monitoring (prod + dev)
- [ ] Automatic usage updates
- [ ] Resource usage dashboard with editor metrics
- [ ] Email notifications for limit approaches
- [ ] Editor session management

### Phase 4: Advanced Features
- [ ] Historical resource analytics
- [ ] Automatic container stopping for overages
- [ ] Resource burst allowances
- [ ] Predictive capacity planning
- [ ] Database flexibility (PostgreSQL, MySQL support)
- [ ] Template marketplace

## Success Metrics
- No single user can crash the server (including dev containers)
- Admin can manage resources in < 2 minutes per user
- Users understand their limits clearly (including editor usage)
- 80%+ server resource utilization without instability
- Fair resource distribution among friend group
- Users can create and edit sites without CLI knowledge
- Editor sessions are stable and responsive
- Development containers auto-cleanup when idle
- Resource overhead for editor < 25% of total system resources