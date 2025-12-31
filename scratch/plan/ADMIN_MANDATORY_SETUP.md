# Admin Panel Mandatory Setup

## Overview
The admin panel is a **mandatory component** that must be created during the initial `deploy setup` command. This ensures every Dial Up Deploy installation has proper administrative controls from day one.

## Setup Flow Requirements

### 1. CLI Setup Command Enhancement
```bash
deploy setup
```

**Must include:**
- Check for existing admin account
- If no admin exists, force admin creation
- Cannot complete setup without admin account
- Generate secure admin credentials
- Start admin web interface automatically

### 2. Admin Account Creation
```bash
# Interactive prompts during setup
Admin Email: admin@example.com
Admin Password: [secure-password-prompt]
Admin Name: Keith
Confirm Setup? [y/N]
```

### 3. Required Admin Setup Steps
1. **Database initialization** with admin tables
2. **Admin user creation** with hashed password
3. **Session secret generation** for auth
4. **Admin web server startup** on configured port
5. **Health check verification** that admin panel loads
6. **Display access credentials** to user

## Technical Implementation

### SQLite Schema
```sql
-- Admin users table (required)
CREATE TABLE admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1
);

-- Admin sessions table
CREATE TABLE admin_sessions (
    id TEXT PRIMARY KEY,
    admin_user_id INTEGER REFERENCES admin_users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    ip_address TEXT,
    user_agent TEXT
);
```

### Environment Configuration
```env
# Added during setup
ADMIN_PORT=3001
ADMIN_SESSION_SECRET=generated-secret-key
ADMIN_BCRYPT_ROUNDS=12
```

### Admin Web Interface Structure
```
src/admin/
├── server.ts          # Admin web server
├── auth/
│   ├── middleware.ts  # Session auth
│   └── handlers.ts    # Login/logout
├── routes/
│   ├── dashboard.ts   # Main admin dashboard
│   ├── users.ts       # User management
│   └── sites.ts       # Site overview
└── views/
    ├── layout.html    # Base template
    ├── login.html     # Login form
    └── dashboard.html # Main dashboard
```

## Setup Validation

### Pre-Setup Checks
- [ ] Port 3001 available for admin interface
- [ ] SQLite database writable
- [ ] Required directories exist
- [ ] No existing admin accounts (or confirm overwrite)

### Post-Setup Verification
- [ ] Admin user created in database
- [ ] Admin web server responds on configured port
- [ ] Login form loads correctly
- [ ] Admin can authenticate successfully
- [ ] Dashboard displays system status

## Error Handling

### Setup Failures
- **Database connection fails**: Clear error message, suggest permissions fix
- **Port already in use**: Suggest different port or show what's using it
- **Invalid admin email**: Show format requirements
- **Password too weak**: Show strength requirements

### Recovery Scenarios
```bash
# Reset admin account if forgotten
deploy admin reset

# Change admin password
deploy admin password

# Recreate admin tables if corrupted
deploy admin repair
```

## Security Requirements

### Password Policy
- Minimum 8 characters
- Must include uppercase, lowercase, number
- No common passwords (dictionary check)
- Bcrypt hashing with 12 rounds

### Session Management
- 24-hour session expiration
- Secure session cookies
- CSRF protection on forms
- IP-based session validation

### Access Control
- Admin interface only accessible to authenticated admins
- No public registration for admin accounts
- All admin actions logged with timestamps

## Integration Points

### CLI Commands
```bash
deploy setup           # Create admin during initial setup
deploy admin status    # Check admin panel health
deploy admin reset     # Reset admin credentials
deploy admin logs      # View admin access logs
```

### Deployment Integration
- Admin panel must be running for user deployments
- Users authenticate through admin panel
- Admin panel monitors all deployments

## Success Criteria
- [ ] Cannot complete `deploy setup` without creating admin
- [ ] Admin panel accessible immediately after setup
- [ ] Admin can log in with created credentials
- [ ] All setup steps complete without manual intervention
- [ ] Clear error messages for any setup failures