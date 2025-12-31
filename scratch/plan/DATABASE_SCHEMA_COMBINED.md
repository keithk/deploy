# Database Schema - Combined Admin/User System

## Core Tables

### users
Main user table - admins are users with `is_admin = 1`

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Resource limits (set by admin)
    max_sites INTEGER DEFAULT 3,
    max_memory_mb INTEGER DEFAULT 512,
    max_cpu_cores REAL DEFAULT 0.5,
    max_storage_mb INTEGER DEFAULT 1024,
    
    -- Status
    is_active BOOLEAN DEFAULT 1,
    last_login DATETIME,
    
    -- Registration settings
    can_create_sites BOOLEAN DEFAULT 1
);
```

### user_sessions
Session management across both subdomains

```sql
CREATE TABLE user_sessions (
    id VARCHAR(128) PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);
```

### sites
User-owned sites (replaces/extends current processes table)

```sql
CREATE TABLE sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    template VARCHAR(50) DEFAULT 'static',
    
    -- File system
    path VARCHAR(500) NOT NULL, -- relative to sites/
    
    -- Status
    status VARCHAR(20) DEFAULT 'stopped', -- stopped, running, building, error
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_deployed DATETIME,
    last_edited DATETIME,
    
    -- Resource usage tracking
    current_memory_mb INTEGER DEFAULT 0,
    current_cpu_usage REAL DEFAULT 0,
    current_storage_mb INTEGER DEFAULT 0,
    
    -- Build/deploy info
    build_command TEXT,
    start_command TEXT,
    environment_vars TEXT, -- JSON string
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(name, user_id),
    UNIQUE(domain)
);

CREATE INDEX idx_sites_user ON sites(user_id);
CREATE INDEX idx_sites_domain ON sites(domain);
```

### system_settings
Global settings managed by admin

```sql
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    
    FOREIGN KEY (updated_by) REFERENCES users(id)
);

-- Default settings
INSERT INTO system_settings (key, value, description) VALUES 
('registration_enabled', 'true', 'Allow new user registration'),
('admin_domain', 'admin', 'Subdomain for admin panel'),
('editor_domain', 'editor', 'Subdomain for code editor'),
('default_max_sites', '3', 'Default max sites for new users'),
('default_max_memory', '512', 'Default memory limit in MB'),
('default_max_cpu', '0.5', 'Default CPU limit in cores'),
('default_max_storage', '1024', 'Default storage limit in MB');
```

## Migration from Current System

### Link existing sites to admin user
```sql
-- Create admin user (done in CLI setup)
INSERT INTO users (username, email, password_hash, is_admin, max_sites, max_memory_mb, max_cpu_cores, max_storage_mb)
VALUES ('admin', 'admin@localhost', '$hashed_password', 1, 999, 4096, 2.0, 10240);

-- Migrate existing processes to sites
INSERT INTO sites (user_id, name, domain, path, status, created_at, last_deployed)
SELECT 
    1 as user_id, -- admin user
    name,
    domain,
    path,
    CASE 
        WHEN status = 'running' THEN 'running'
        WHEN status = 'stopped' THEN 'stopped'
        ELSE 'stopped'
    END as status,
    created_at,
    updated_at as last_deployed
FROM processes;
```

## Template System

### site_templates
Available templates for site creation

```sql
CREATE TABLE site_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Template files
    files TEXT NOT NULL, -- JSON array of template files
    
    -- Resource recommendations
    recommended_memory INTEGER DEFAULT 256,
    recommended_cpu REAL DEFAULT 0.2,
    
    -- Commands
    install_command TEXT, -- npm install, etc
    build_command TEXT,
    start_command TEXT,
    
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default templates
INSERT INTO site_templates (name, display_name, description, files, install_command, build_command, start_command) VALUES
('static', 'Static HTML', 'Simple HTML/CSS/JS site', '["index.html", "style.css", "script.js"]', null, null, null),
('node', 'Node.js App', 'Basic Node.js application', '["package.json", "server.js"]', 'npm install', null, 'npm start'),
('astro', 'Astro Site', 'Modern static site with Astro', '["package.json", "astro.config.mjs", "src/pages/index.astro"]', 'npm install', 'npm run build', 'npm run preview');
```

## Views for Easy Queries

### user_site_summary
```sql
CREATE VIEW user_site_summary AS
SELECT 
    u.id as user_id,
    u.username,
    u.is_admin,
    COUNT(s.id) as site_count,
    u.max_sites,
    SUM(s.current_memory_mb) as total_memory_mb,
    u.max_memory_mb,
    SUM(s.current_cpu_usage) as total_cpu_usage,
    u.max_cpu_cores,
    SUM(s.current_storage_mb) as total_storage_mb,
    u.max_storage_mb
FROM users u
LEFT JOIN sites s ON u.id = s.user_id
GROUP BY u.id;
```

### active_sessions
```sql
CREATE VIEW active_sessions AS
SELECT 
    s.*,
    u.username,
    u.is_admin
FROM user_sessions s
JOIN users u ON s.user_id = u.id
WHERE s.expires_at > datetime('now');
```

## Security Considerations

- Password hashing with bcrypt/scrypt
- Session tokens are cryptographically secure random strings
- Rate limiting on auth endpoints
- CSRF protection for forms
- Input validation on all user data
- SQL injection protection through prepared statements

## Database File Location

```
/var/lib/dialup/database.db  # Production
./database.db                # Development
```

## Backup Strategy

```bash
# Simple backup script
sqlite3 database.db ".backup database.backup.$(date +%Y%m%d_%H%M%S).db"
```