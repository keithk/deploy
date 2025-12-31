# Simple Community Hosting Architecture

## Architecture Philosophy

### Core Principles
- **Simplicity over complexity**: No microservices, no orchestration complexity
- **Community scale**: Optimized for 6-12 friends sharing resources
- **Single server**: Everything runs on one medium VPS server
- **Self-service focus**: Users can create and edit sites independently
- **Web-first**: Browser-based editing with optional CLI for power users
- **Admin oversight**: Admin panel provides resource management and monitoring

### Anti-Patterns We Avoid
- ❌ Kubernetes or complex orchestration
- ❌ Multiple databases or data stores  
- ❌ Separate authentication services
- ❌ Complex organization hierarchies
- ❌ Enterprise-grade monitoring stacks

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       VPS Server                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Caddy Proxy                         ││
│  │           (SSL + Routing + Rate Limiting)               ││
│  └─────────────────────────────────────────────────────────┘│
│                            │                                │
│  ┌─────────────────────────┼─────────────────────────────┐  │
│  │   Admin Panel    │  Code Editor    │   User Sites    │  │
│  │  (Port 3001)     │  (Port 3002)    │   (Port 8000+)  │  │
│  │ ┌─────────────┐  │ ┌─────────────┐ │ ┌─────────────┐ │  │
│  │ │ Bun Server  │  │ │ Bun Server  │ │ │   Docker    │ │  │
│  │ │ - Dashboard │  │ │ - CodeMirror│ │ │ Containers  │ │  │
│  │ │ - User Mgmt │  │ │ - Templates │ │ │ - Static    │ │  │
│  │ │ - Site Mgmt │  │ │ - File Mgmt │ │ │ - Node 22   │ │  │
│  │ │ - Resources │  │ │ - Hot Reload│ │ │ - Dev Mode  │ │  │
│  │ └─────────────┘  │ └─────────────┘ │ └─────────────┘ │  │
│  └─────────────────────┼─────────────────────────────────┘  │
│                        │                                    │
│  ┌─────────────────────┼─────────────────────────────────┐  │
│  │              SQLite/Custom Database                    │  │
│  │  ┌─────────────────────────────────────────────────┐   │  │
│  │  │ - users (with login)  - editor_sessions        │   │  │
│  │  │ - user_sites          - site_templates         │   │  │
│  │  │ - deployments         - resource_usage         │   │  │
│  │  └─────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Caddy Reverse Proxy (Entry Point)
**Purpose**: Single entry point for all HTTP/HTTPS traffic
```caddyfile
# Admin panel access
admin.yourdomain.com {
    reverse_proxy localhost:3001
    rate_limit zone admin 100r/m
}

# Code editor access
editor.yourdomain.com {
    reverse_proxy localhost:3002
    rate_limit zone editor 200r/m
    @websocket {
        header Connection Upgrade
        header Upgrade websocket
    }
    handle @websocket {
        reverse_proxy localhost:3002
    }
}

# Development preview subdomains
*-dev.yourdomain.com {
    reverse_proxy localhost:{dev_port_based_on_subdomain}
}

# Production user sites  
*.yourdomain.com {
    reverse_proxy localhost:{port_based_on_subdomain}
    
    @static_files {
        path *.css *.js *.png *.jpg *.ico
    }
    handle @static_files {
        header Cache-Control "public, max-age=31536000"
    }
}
```

**Responsibilities**:
- SSL certificate management (Let's Encrypt)
- Subdomain routing to user sites
- Rate limiting per domain/user
- Static asset caching
- Health check endpoints

### 2. Admin Panel (Bun Application)
**Purpose**: Administrative management interface for the system
```
src/admin/
├── server.ts              # Main Bun server
├── auth/
│   ├── middleware.ts      # Session authentication
│   ├── sessions.ts        # Session management
│   └── password.ts        # Password hashing/verification
├── routes/
│   ├── dashboard.ts       # System overview dashboard
│   ├── users.ts           # User CRUD operations
│   ├── sites.ts           # Site management interface
│   ├── resources.ts       # Resource monitoring/limits
│   └── settings.ts        # Database config, system settings
├── services/
│   ├── docker.ts          # Docker container management
│   ├── database.ts        # Database abstraction layer
│   ├── monitoring.ts      # System resource monitoring
│   └── deployment.ts      # Site deployment logic
└── views/
    ├── layouts/
    ├── components/
    └── pages/
```

**Key Features**:
- User management with self-service capabilities
- Resource limit management per user
- Site deployment monitoring
- System health dashboard
- Database configuration (SQLite/custom)
- Backup/restore functionality

### 3. Code Editor (New Bun Application)
**Purpose**: Web-based code editing interface for users
```
src/editor/
├── server.ts              # Editor server with WebSocket support
├── auth/
│   ├── middleware.ts      # User authentication
│   └── sessions.ts        # Session management
├── routes/
│   ├── editor.ts          # Main editor interface
│   ├── files.ts           # File management API
│   ├── templates.ts       # Site template selection
│   ├── preview.ts         # Live preview management
│   └── deploy.ts          # Deploy to production
├── services/
│   ├── file-manager.ts    # File system operations
│   ├── container.ts       # Development container management
│   ├── templates.ts       # Site template management
│   └── hot-reload.ts      # Live reload functionality
├── static/
│   ├── codemirror/        # CodeMirror 6 assets
│   ├── templates/         # Site starter templates
│   └── editor.js          # Frontend editor logic
└── views/
    ├── editor.html        # Main editor interface
    └── templates.html     # Template selection
```

**Key Features**:
- CodeMirror 6 integration for syntax highlighting
- File tree navigation and management
- Live preview with hot reload
- Site template/starter selection
- Real-time collaboration (future)
- One-click deploy to production
- Terminal/console integration

### 4. User Self-Service Portal
**Purpose**: User registration, login, and site management
```
# New routes added to main application
/login                     # User login page
/register                  # User registration (optional)
/dashboard                 # User's site overview
/sites                     # User's site list
/sites/:id                 # Individual site management
/editor/:site_id           # Redirect to editor subdomain
```

**Integration Points**:
- Shared authentication with editor subdomain
- Resource usage display from admin panel
- Direct links to editor for each site
- Self-service site creation with templates

### 5. CLI Tool (Enhanced)
**Purpose**: User-facing deployment interface
```bash
# User authentication through admin panel
deploy login --server yourdomain.com

# Site deployment
deploy site --domain mysite.yourdomain.com

# User status and resource usage
deploy status --resources

# Site management
deploy sites list
deploy sites stop mysite
deploy sites restart mysite
```

**Integration Points**:
- Authenticates against admin panel API
- Respects user resource limits
- Provides clear error messages for limit violations
- Shows resource usage to users

### 6. Docker Container Management
**Purpose**: Isolated execution environments for user sites

```javascript
// Container strategy per site type
const CONTAINER_CONFIGS = {
  static: {
    image: 'nginx:alpine',
    memory: '64m',
    cpu: '0.1',
    ports: ['${DYNAMIC_PORT}:80'],
    volumes: ['${SITE_PATH}:/usr/share/nginx/html:ro']
  },
  
  nodejs: {
    image: 'node:22-alpine', 
    memory: '256m',
    cpu: '0.25',
    ports: ['${DYNAMIC_PORT}:3000'],
    volumes: ['${SITE_PATH}:/app'],
    command: 'npm start'
  },
  
  astro: {
    image: 'node:22-alpine',
    memory: '128m', 
    cpu: '0.15',
    ports: ['${DYNAMIC_PORT}:4321'],
    volumes: ['${SITE_PATH}:/app'],
    command: 'npm run preview'
  },
  
  // NEW: Development containers for live editing
  nodejs_dev: {
    image: 'node:22-alpine',
    memory: '512m',
    cpu: '0.3',
    ports: ['${DEV_PORT}:3000'],
    volumes: ['${DEV_WORKSPACE}:/app', 'node_modules_cache:/app/node_modules'],
    environment: ['NODE_ENV=development', 'CHOKIDAR_USEPOLLING=true'],
    command: 'npm run dev'
  }
};
```

**Container Lifecycle**:
1. **Build phase**: Create optimized container image
2. **Deploy phase**: Start container with resource limits
3. **Health check**: Verify container responds to requests
4. **Monitor phase**: Track resource usage continuously
5. **Cleanup phase**: Remove stopped containers and unused images

### 7. Database Layer (Flexible)
**Purpose**: Data storage with flexibility for different database types

```javascript
// Database abstraction layer
const DatabaseAdapter = {
  sqlite: {
    connection: '/var/lib/dialup/data/database.sqlite',
    driver: 'better-sqlite3',
    migrations: './migrations/sqlite/'
  },
  
  postgresql: {
    connection: process.env.DATABASE_URL,
    driver: 'pg',
    migrations: './migrations/postgresql/'
  },
  
  mysql: {
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME
    },
    driver: 'mysql2',
    migrations: './migrations/mysql/'
  }
};
```

### Default SQLite Schema
**Purpose**: Simple, reliable data storage

```sql
-- Core tables structure
CREATE TABLE admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT,
    
    -- Resource limits (set by admin)
    max_sites INTEGER DEFAULT 3,
    max_memory_mb INTEGER DEFAULT 512,
    max_cpu_cores REAL DEFAULT 0.5,
    max_storage_mb INTEGER DEFAULT 1024,
    
    -- Self-service capabilities
    can_create_sites BOOLEAN DEFAULT 1,
    can_use_editor BOOLEAN DEFAULT 1,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
);

CREATTE TABLE editor_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    site_id INTEGER REFERENCES user_sites(id),
    session_token TEXT UNIQUE NOT NULL,
    dev_container_id TEXT,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE site_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    template_path TEXT NOT NULL,
    preview_image TEXT,
    framework TEXT, -- 'static', 'astro', 'next', 'node'
    is_active BOOLEAN DEFAULT 1
);

CREATE TABLE user_sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    domain TEXT NOT NULL,
    container_id TEXT,
    port INTEGER,
    dev_container_id TEXT,     -- NEW: Development container
    dev_port INTEGER,          -- NEW: Development port
    site_type TEXT, -- 'static', 'nodejs', 'astro', etc.
    template_id INTEGER REFERENCES site_templates(id),
    
    -- Resource allocation
    allocated_memory_mb INTEGER,
    allocated_cpu_cores REAL,
    storage_used_mb INTEGER DEFAULT 0,
    
    -- Status tracking
    status TEXT DEFAULT 'active', -- active, stopped, building, failed, editing
    last_deployed DATETIME,
    last_edited DATETIME,      -- NEW: Last editor activity
    build_log TEXT,
    error_message TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, domain)
);

CREATE TABLE deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER REFERENCES user_sites(id),
    commit_hash TEXT,
    build_duration_seconds INTEGER,
    deploy_status TEXT, -- success, failed, building
    build_log TEXT,
    deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Data Flow Architecture

### Self-Service Site Creation Flow
```
1. User logs into editor.yourdomain.com
2. User selects template from available options
3. System creates new site record in database
4. Clone template files to user's dev workspace
5. Spin up development container with hot reload
6. User edits files in browser-based CodeMirror editor
7. Changes sync via WebSocket to development container
8. Live preview available at sitename-dev.yourdomain.com
9. User clicks "Deploy" when satisfied
10. Build production container and deploy to sitename.yourdomain.com
11. Update Caddyfile routing for both dev and prod domains
```

### Traditional CLI Deployment Flow (Still Supported)
```
1. User runs: deploy site --domain example.yourdomain.com
2. CLI authenticates with admin panel API
3. Admin panel checks user resource limits
4. If allowed, create new site record in database
5. Start Docker container build process
6. Update Caddyfile with new subdomain routing
7. Reload Caddy configuration
8. Update site status to 'active' in database
9. Return success message to user
```

### Resource Monitoring Flow
```
1. Background process runs every 5 minutes
2. Query Docker API for container resource usage
3. Update user_sites table with current usage
4. Calculate per-user total resource consumption
5. Check against user limits, generate warnings
6. Update admin dashboard with latest stats
7. Send email alerts for limit violations
```

## Security Architecture

### Authentication Layers
```
┌─────────────────────────────────────────────┐
│              Public Internet               │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│              Caddy (SSL)                   │ ← HTTPS termination
└─────────────────┬───────────────────────────┘
                  │
      ┌───────────┼────────────┬──────────────┐
      ▼           ▼            ▼              ▼
┌─────────────┐┌──────────────┐┌─────────────┐┌─────────────────┐
│ Admin Panel ││ Code Editor  ││Self-Service ││   User Sites    │
│ (Admin Only)││(User Sessions│││Portal      ││  (No direct     │
│             ││+ WebSockets) ││(User Login) ││   authentication│
└─────────────┘└──────────────┘└─────────────┘└─────────────────┘
```

### Access Control
- **Admin Panel**: Admin session authentication, CSRF protection
- **Code Editor**: User session authentication, WebSocket security
- **Self-Service Portal**: User registration/login with session management  
- **API Endpoints**: Session-based auth (admin or user depending on endpoint)
- **User Sites**: No direct authentication (public or handle own auth)
- **CLI Tool**: API key authentication through admin panel
- **Development Containers**: Isolated network, resource limits, non-root user

## Scalability Considerations

### Vertical Scaling Path
```
Current: Medium VPS (4GB RAM, 2 CPU)
    ↓ When 80%+ resource utilization
Next: Large VPS (8GB RAM, 4 CPU)
    ↓ Simple migration process
Future: XL VPS (16GB RAM, 8 CPU)
```

### Horizontal Scaling Preparation
- Database: SQLite → PostgreSQL migration path
- Load balancing: Multiple servers behind load balancer
- Shared storage: Object storage for user site files (S3, Spaces, etc.)
- Container orchestration: Consider Docker Swarm for multi-node

## Deployment Architecture

### File System Structure
```
/opt/dialup/
├── bin/
│   └── deploy              # CLI binary
├── admin/                  # Admin panel source
├── editor/                 # Code editor application
├── config/
│   ├── Caddyfile          # Caddy configuration
│   ├── settings.json      # System settings
│   └── database.json      # Database configuration
├── data/
│   ├── database.sqlite    # Default SQLite database
│   ├── sessions/          # Session storage
│   └── logs/              # Application logs
├── sites/                 # User site files (production)
│   ├── user1/
│   ├── user2/
│   └── ...
├── dev-workspaces/        # Development workspaces
│   ├── user1_site1/
│   ├── user1_site2/
│   └── ...
├── templates/             # Site starter templates
│   ├── static/
│   ├── astro/
│   ├── next/
│   └── node/
└── backups/               # Automated backups
```

### Service Management
```yaml
# systemd service files
/etc/systemd/system/dialup-admin.service    # Admin panel
/etc/systemd/system/dialup-editor.service   # Code editor application
/etc/systemd/system/dialup-monitor.service  # Resource monitoring
/etc/systemd/system/caddy.service          # Caddy reverse proxy
```

## Monitoring and Observability

### Health Check Endpoints
```
GET /health              # Overall system health
GET /health/database     # Database connectivity
GET /health/docker       # Docker daemon status
GET /health/storage      # Disk space availability
GET /health/memory       # Memory usage
```

### Logging Strategy
- **Application logs**: Structured JSON logs via Bun's built-in logger
- **Access logs**: Caddy access logs for all HTTP requests
- **Container logs**: Docker container stdout/stderr
- **System logs**: Standard Linux system logs via journald

### Simple Alerting
- **Email alerts**: For critical resource usage or failures
- **Admin dashboard**: Real-time status indicators
- **CLI notifications**: Warn users approaching limits

## Success Criteria

### Technical Goals
- **Setup time**: Complete setup in under 10 minutes
- **Response time**: All sites respond in under 2 seconds
- **Resource efficiency**: Support 8+ users on medium VPS server
- **Reliability**: 99%+ uptime for hosted sites

### User Experience Goals
- **Admin onboarding**: Admin can manage users in under 5 minutes
- **User onboarding**: Users can deploy first site in under 3 minutes
- **Transparency**: Users understand resource limits clearly
- **Community feel**: Designed for friends helping friends host sites