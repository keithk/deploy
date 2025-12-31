# VPS Resource Optimization

## Target Server Specifications

### Medium VPS Resources
- **Memory**: 4GB RAM
- **CPU**: 2 vCPUs
- **Storage**: 50GB SSD
- **Bandwidth**: 4TB transfer
- **Cost**: ~$20-30/month (varies by provider)

### Optimization Goals
- Host 6-10 friend sites comfortably
- 80% resource utilization maximum
- Sub-2 second response times
- 99% uptime for hosted sites
- Easy horizontal scaling path

## Memory Optimization Strategy

### System Overhead Allocation
```
Total Memory: 4GB
├── System/OS: 512MB (13%)
├── Dial Up Deploy: 256MB (6%)
├── Admin Panel: 128MB (3%)
├── Code Editor: 256MB (6%)  # NEW: Web-based editor
├── Docker Engine: 256MB (6%)
├── Buffer/Cache: 512MB (13%)
└── User Sites: 2.1GB (53%)  # Reduced for editor overhead
```

### Container Memory Efficiency
- **Shared Base Images**: Use common Node.js/static base images
- **Memory Limits**: Set strict Docker memory limits per container
- **Lazy Loading**: Start containers only when traffic detected
- **Memory Monitoring**: Kill runaway processes before they impact server

### Optimized Container Sizes
```yaml
# Typical container allocations
static_site: 64MB      # Nginx serving static files
node_app: 256MB       # Node.js 22 application
astro_site: 128MB     # Astro static site with SSR
next_app: 512MB       # Full Next.js application
editor_dev: 512MB     # Development container with hot reload
```

## CPU Optimization Strategy

### CPU Core Allocation
```
Total CPU: 2 cores
├── System processes: 0.3 cores (15%)
├── Dial Up Deploy: 0.2 cores (10%)
├── Admin Panel: 0.1 cores (5%)
├── Code Editor: 0.2 cores (10%)  # NEW: Editor with file watching
├── Docker overhead: 0.2 cores (10%)
└── User containers: 1.0 cores (50%)  # Reduced for editor
```

### CPU Sharing Approach
- **Burst capability**: Allow containers to burst above allocation
- **CPU quotas**: Prevent any single container from monopolizing CPU
- **Process prioritization**: System processes get higher priority
- **Load balancing**: Distribute CPU-intensive tasks across containers

## Storage Optimization

### Directory Structure
```
/var/lib/dialup/
├── system/              # 2GB - System databases, logs
├── admin/               # 1GB - Admin panel assets
├── editor/              # 2GB - Editor assets, templates, cache
├── containers/          # 10GB - Container images and volumes
├── user-sites/          # 25GB - User site files and builds
├── dev-workspaces/      # 5GB - Live editing workspaces
├── backups/             # 4GB - Automated backups
└── temp/                # 1GB - Build artifacts, temporary files
```

### Storage Efficiency Measures
- **Image layer sharing**: Maximize Docker layer reuse
- **Automatic cleanup**: Remove old builds and unused images
- **Compression**: Gzip static assets, compress backups
- **Symlinks**: Share common dependencies between sites

## Network Optimization

### Caddy Configuration
```caddyfile
# Optimized for medium VPS
{
    # Global optimization settings
    auto_https on
    admin off
    
    # Connection limits
    max_conns 1000
    
    # Memory optimizations  
    buffer_size 8KB
    max_header_size 16KB
}

# Rate limiting per site
(site_limits) {
    rate_limit {
        zone static 10r/s
        zone api 50r/s
    }
}
```

### Connection Management
- **Connection pooling**: Reuse HTTP connections
- **Keep-alive optimization**: Reduce connection overhead
- **Gzip compression**: Minimize bandwidth usage
- **Static asset caching**: Cache frequently accessed files

## Container Orchestration

### Smart Container Management
```javascript
const CONTAINER_STRATEGIES = {
  // Always running for high-traffic sites
  persistent: {
    min_instances: 1,
    max_instances: 1,
    startup_policy: 'immediate'
  },
  
  // Start on demand for low-traffic sites  
  lazy: {
    min_instances: 0,
    max_instances: 1,
    startup_policy: 'on_request',
    idle_timeout: 300000 // 5 minutes
  },
  
  // Scale up for popular sites
  scalable: {
    min_instances: 1,
    max_instances: 2,
    startup_policy: 'immediate',
    scale_threshold: 50 // requests per minute
  },
  
  // NEW: Development containers with hot reload
  development: {
    min_instances: 1,
    max_instances: 1,
    startup_policy: 'immediate',
    features: ['hot_reload', 'file_watching', 'debug_mode'],
    idle_timeout: 1800000, // 30 minutes
    volume_mounts: ['dev-workspace:/app', 'node_modules_cache:/app/node_modules']
  }
};
```

### Code Editor Container Strategy
```javascript
const EDITOR_CONTAINER_CONFIG = {
  // Base configuration for development containers
  development_base: {
    image: 'node:22-alpine',
    memory: '512m',
    cpu: '0.25',
    volumes: [
      '/var/lib/dialup/dev-workspaces/${site_id}:/app',
      '/var/lib/dialup/editor/node_modules_cache:/cache/node_modules'
    ],
    environment: {
      NODE_ENV: 'development',
      CHOKIDAR_USEPOLLING: 'true', // For file watching in containers
      HOT_RELOAD: 'true'
    },
    features: ['file_watching', 'hot_reload', 'package_management']
  },
  
  // Security considerations for user code editing
  security: {
    read_only_root_fs: false, // Need write access for npm install
    no_new_privileges: true,
    user: 'node:node',
    network_mode: 'isolated', // Separate network for dev containers
    resource_limits: {
      max_file_descriptors: 1024,
      max_processes: 50
    }
  }
};
```

### Live Code Editing Flow
1. **Editor Access**: User opens editor.yourdomain.com/sites/mysite
2. **Container Spin-up**: Create development container with hot reload
3. **File Sync**: Editor changes sync to container filesystem via WebSocket
4. **Hot Reload**: Container detects changes and rebuilds/restarts as needed
5. **Preview**: User sees live preview at mysite-dev.yourdomain.com
6. **Deploy**: User clicks "Deploy" to promote dev version to production

### Resource-Aware Scheduling
- **Placement optimization**: Place containers to minimize resource conflicts
- **Health checking**: Monitor container health and restart failures quickly
- **Graceful shutdowns**: Allow containers to finish requests before stopping
- **Resource reclaim**: Quickly recycle resources from stopped containers
- **Editor priority**: Development containers get CPU priority during active editing

## Monitoring and Alerting

### System Health Monitoring
```javascript
const HEALTH_THRESHOLDS = {
  memory_warning: 75,    // Warn at 75% memory usage
  memory_critical: 90,   // Critical at 90% memory usage
  cpu_warning: 80,       // Warn at 80% CPU usage
  storage_warning: 85,   // Warn at 85% storage usage
  load_warning: 1.5,     // Warn at load average > 1.5
};
```

### Automated Responses
- **Memory pressure**: Stop idle containers when memory low
- **CPU overload**: Throttle non-critical processes
- **Storage full**: Clean temp files and old builds
- **Network congestion**: Enable additional rate limiting

## Performance Optimizations

### Build Process Efficiency
```yaml
# Optimized build pipeline
build_optimization:
  - parallel_builds: 2        # Max 2 concurrent builds
  - build_timeout: 600s       # 10 minute build timeout
  - cache_layers: true        # Cache Docker layers
  - incremental_builds: true  # Only rebuild changed parts
```

### Static Asset Optimization
- **CDN integration**: Serve assets from object storage (AWS S3, DigitalOcean Spaces, etc.)
- **Image optimization**: Compress images during build
- **Bundle splitting**: Split large JavaScript bundles
- **Lazy loading**: Load resources only when needed

## Scaling Preparation

### Horizontal Scaling Readiness
```bash
# Easy migration to larger server
deploy migrate --target-size large

# Database migration strategy
deploy backup --include-db
deploy restore --target-server new-server
```

### Resource Monitoring for Scaling Decisions
- **Usage trends**: Track resource usage over time
- **Performance metrics**: Monitor response times and errors
- **User growth**: Track active users and site count
- **Capacity planning**: Predict when upgrade needed

## Cost Optimization

### Resource Efficiency Measures
- **Shared services**: One Caddy instance serves all sites
- **Efficient base images**: Use Alpine Linux for smaller containers
- **Resource pooling**: Share database connections and file systems
- **Automatic scaling**: Scale down during low-traffic periods

### Monitoring Costs
- **Resource waste detection**: Identify over-allocated resources
- **Usage-based recommendations**: Suggest optimal user limits
- **Capacity utilization**: Track cost per hosted site

## Disaster Recovery

### Backup Strategy
```yaml
backup_schedule:
  database: 
    frequency: every_6_hours
    retention: 7_days
    
  user_sites:
    frequency: daily  
    retention: 30_days
    
  system_config:
    frequency: weekly
    retention: 4_weeks
```

### Recovery Procedures
- **Automated snapshots**: Provider snapshots (available on most VPS providers)
- **Database backups**: SQLite database file backups
- **Site content backups**: User site files and configurations
- **Quick restore**: Restore from backup in under 30 minutes

## Success Metrics

### Performance Targets
- **Response time**: < 2 seconds average
- **Uptime**: > 99% availability
- **Resource utilization**: 60-80% average usage
- **User capacity**: 8-12 active users comfortably

### Efficiency Measures
- **Cost per site**: < $3/month per hosted site
- **Resource waste**: < 10% unused allocated resources
- **Build time**: < 5 minutes average build time
- **Deployment time**: < 30 seconds for simple updates