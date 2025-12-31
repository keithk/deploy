# Database Schema Enhancement Plan

## Current Database Analysis

**Technology**: SQLite with Bun's built-in database support  
**Location**: `/data/dialup-deploy.db`  
**Current Models**: Process tracking (from packages/core/src/database/models/)

### Existing Schema Review
The current database focuses on process management. For scaling to a community platform, we need to extend the schema to support:

1. **Multi-tenancy**: Users and organizations
2. **Resource Management**: Site limits and usage tracking  
3. **Site Configuration**: Enhanced site metadata
4. **Usage Analytics**: Historical resource consumption

---

## Required Schema Extensions

### Users and Organizations

```sql
-- Users table for multi-tenant support
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  is_admin BOOLEAN DEFAULT FALSE
);

-- Organizations for team-based hosting
CREATE TABLE organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  owner_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

-- User-Organization membership
CREATE TABLE organization_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, organization_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
```

### Site Resource Management

```sql
-- Enhanced sites table with resource configuration
CREATE TABLE sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  owner_id INTEGER,
  organization_id INTEGER,
  site_type TEXT NOT NULL, -- 'static', 'dynamic', 'docker', etc.
  repository_url TEXT,
  branch TEXT DEFAULT 'main',
  build_command TEXT,
  start_command TEXT,
  port INTEGER,
  domain TEXT,
  subdomain TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CHECK ((owner_id IS NOT NULL AND organization_id IS NULL) OR 
         (owner_id IS NULL AND organization_id IS NOT NULL))
);

-- Resource limits per site
CREATE TABLE site_resource_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  max_memory_mb INTEGER DEFAULT 512,
  max_cpu_percent INTEGER DEFAULT 50,
  max_disk_mb INTEGER DEFAULT 1024,
  max_bandwidth_mb INTEGER DEFAULT 1024,
  max_requests_per_minute INTEGER DEFAULT 1000,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- Current resource usage tracking
CREATE TABLE site_resource_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  memory_mb REAL,
  cpu_percent REAL,
  disk_mb REAL,
  bandwidth_mb REAL,
  active_requests INTEGER,
  response_time_ms REAL,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- Historical usage aggregation for reporting
CREATE TABLE site_usage_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  date DATE NOT NULL,
  avg_memory_mb REAL,
  max_memory_mb REAL,
  avg_cpu_percent REAL,
  max_cpu_percent REAL,
  total_bandwidth_mb REAL,
  total_requests INTEGER,
  avg_response_time_ms REAL,
  uptime_seconds INTEGER,
  UNIQUE(site_id, date),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);
```

### Deployment and Process Enhancement

```sql
-- Enhanced deployment tracking
CREATE TABLE deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  commit_hash TEXT,
  commit_message TEXT,
  branch TEXT,
  deployed_by INTEGER,
  status TEXT NOT NULL, -- 'pending', 'building', 'success', 'failed'
  build_log TEXT,
  build_time_seconds INTEGER,
  deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (deployed_by) REFERENCES users(id)
);

-- Process management with resource tracking
-- (Extends existing process model)
ALTER TABLE processes ADD COLUMN site_id INTEGER REFERENCES sites(id);
ALTER TABLE processes ADD COLUMN memory_limit_mb INTEGER;
ALTER TABLE processes ADD COLUMN cpu_limit_percent INTEGER;
ALTER TABLE processes ADD COLUMN container_id TEXT;
ALTER TABLE processes ADD COLUMN health_check_url TEXT;
ALTER TABLE processes ADD COLUMN last_health_check DATETIME;
```

### Configuration and Settings

```sql
-- System-wide configuration
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Site environment variables
CREATE TABLE site_environment_variables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  is_secret BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site_id, key),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- Site custom domains
CREATE TABLE site_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  domain TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  ssl_enabled BOOLEAN DEFAULT TRUE,
  ssl_cert_path TEXT,
  verified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);
```

---

## Migration Strategy

### Phase 1: Core Extensions (Non-Breaking)
1. Add new tables without modifying existing schema
2. Create indexes for performance optimization
3. Insert default configuration values
4. Add foreign keys to link existing data

### Phase 2: Data Migration
1. Migrate existing sites to new sites table structure
2. Create default user accounts for existing sites
3. Set default resource limits for existing sites
4. Populate historical usage data where available

### Phase 3: Schema Optimization
1. Add database constraints and validations
2. Create performance indexes
3. Set up automated cleanup procedures
4. Implement database backup strategies

---

## Database Access Patterns

### High-Frequency Queries
- Resource usage recording (every 30 seconds per site)
- Process health checks (every minute)
- Site status dashboard updates (real-time)
- Admin panel metrics (on-demand)

### Performance Considerations
- Index on `site_resource_usage.site_id, timestamp`
- Index on `sites.owner_id` and `sites.organization_id`
- Partitioning strategy for usage data (monthly tables)
- Automated cleanup of old usage data (>6 months)

### Connection Management
- Leverage Bun's built-in SQLite connection pooling
- Read replicas for dashboard queries if needed
- WAL mode for better concurrent access
- Regular VACUUM operations for space efficiency

---

## Integration Points

### With Resource Management Core (Stage 2)
- Database models for resource monitoring
- Usage data collection interfaces
- Resource limit enforcement queries

### With Admin Panel (Stage 4)
- Dashboard query optimization
- Real-time metrics aggregation
- User management interfaces

### With Container Orchestration (Stage 3)
- Container metadata storage
- Health check status tracking
- Deployment history integration

---

## Database Architecture Decisions

### Why Continue with SQLite?
- **Self-hosted Focus**: Perfect for single-server deployments
- **Zero Configuration**: No separate database server needed
- **Excellent Performance**: Sufficient for expected load (100+ sites)
- **ACID Compliance**: Reliable for critical configuration data
- **Backup Simplicity**: Single file backup/restore

### Data Retention Policy
- **Usage Metrics**: Raw data for 30 days, daily aggregates for 1 year
- **Deployment Logs**: Keep all deployments, archive logs after 90 days
- **Process Logs**: Rolling logs with configurable retention
- **User Activity**: Audit logs for 1 year

### Security Considerations
- **Password Hashing**: bcrypt with configurable rounds
- **Secret Storage**: Encrypt environment variables at rest
- **Access Control**: Row-level security for multi-tenancy
- **Audit Logging**: Track all administrative actions

---

## Implementation Tasks for Database Architect

### Immediate Tasks
1. **Review Current Models**: Analyze existing database structure in `packages/core/src/database/`
2. **Design Schema Migrations**: Create incremental migration scripts
3. **Performance Testing**: Benchmark with expected load patterns
4. **Integration Planning**: Define interfaces for other stages

### Deliverables
- [ ] Migration scripts for each schema change
- [ ] Database model classes for new tables
- [ ] Performance benchmarks and optimization recommendations
- [ ] Integration interfaces for resource management and admin panel
- [ ] Data backup and recovery procedures

### Dependencies
- **Stage 2**: Resource management core needs database interfaces
- **Stage 4**: Admin panel requires optimized dashboard queries
- **Stage 5**: Production deployment needs migration automation

---

## Questions for Database Architect

1. Should we implement database sharding for horizontal scaling?
2. What's the expected query load for real-time resource monitoring?
3. How should we handle database migrations in production with zero downtime?
4. What indexing strategy would optimize both writes and dashboard reads?
5. Should sensitive data encryption be implemented at the application or database level?

**Next Steps**: Database architect should review this plan and provide detailed implementation specifications for the schema enhancement stage.