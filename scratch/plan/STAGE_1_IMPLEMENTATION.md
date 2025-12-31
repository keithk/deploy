# Stage 1 Implementation Plan
## Combined Admin & User System

### Current State Analysis
- CLI setup command exists in `packages/cli/src/commands/setup.ts`
- Handles Caddy configuration, domain setup, certificates
- No database initialization or admin user creation
- Admin panel exists in `packages/admin/` but appears to be basic

### Changes Needed

## 1. Database Setup & Migration

### A. Create database initialization
**File**: `packages/core/src/database/migrations.ts`
```typescript
export const migrations = [
  {
    version: 1,
    name: 'create_users_table',
    up: `CREATE TABLE users (...)`
  },
  {
    version: 2, 
    name: 'create_sessions_table',
    up: `CREATE TABLE user_sessions (...)`
  },
  // ... other tables from our schema
];
```

### B. Update database.ts to handle migrations
**File**: `packages/core/src/database/database.ts`
- Add migration runner
- Add user-related queries
- Update existing process queries to work with new schema

## 2. CLI Setup Command Enhancement

### A. Update setup.ts
**File**: `packages/cli/src/commands/setup.ts`

Add after line 157 (after domain setup):
```typescript
// Initialize database and create admin user
log.step("Setting up database and admin user...");
if (!(await setupDatabase(domain, log))) {
  log.error("Failed to set up database and admin user.");
  return false;
}
```

### B. Create setupDatabase function
**File**: `packages/cli/src/utils/setup-utils.ts`
```typescript
async function setupDatabase(domain: string, log: any): Promise<boolean> {
  // Run database migrations
  // Prompt for admin user details
  // Create admin user with hashed password
  // Migrate existing sites to admin user
  // Save admin domain setting
}
```

## 3. Authentication System

### A. Create auth utilities
**File**: `packages/core/src/auth/index.ts`
```typescript
export { hashPassword, verifyPassword } from './password';
export { createSession, validateSession, destroySession } from './sessions';
export { requireAuth, requireAdmin } from './middleware';
```

### B. Session management
- JWT or simple session tokens
- Cross-subdomain session sharing
- Session cleanup/expiration

## 4. Admin Panel Updates

### A. Replace existing admin panel
**Directory**: `packages/admin/`
- Convert to TypeScript
- Add login page
- Add user management interface
- Add system settings

### B. Server integration
**File**: `packages/server/src/routing/subdomainRouter.ts`
- Add admin.yourdomain routing
- Add authentication middleware
- Handle session validation

## 5. Editor Subdomain Setup

### A. Create editor package
**Directory**: `packages/editor/`
```
packages/editor/
├── src/
│   ├── server.ts          # Express/Hono server
│   ├── routes/
│   │   ├── auth.ts        # login/register
│   │   ├── dashboard.ts   # user dashboard
│   │   └── api.ts         # file operations
│   ├── views/
│   │   ├── login.html
│   │   ├── dashboard.html
│   │   └── editor.html
│   └── static/
│       ├── style.css
│       └── editor.js
```

### B. Basic routes needed:
- `GET /` → Dashboard (if logged in) or Login
- `POST /login` → Authenticate user
- `POST /register` → Create new user (if enabled)
- `GET /dashboard` → User site list
- `POST /api/sites` → Create new site
- `GET /editor/:siteId` → File editor interface

## 6. Caddy Configuration Updates

### A. Update Caddyfile generation
**File**: `packages/core/src/utils/caddyfile.ts`

Add subdomain routing:
```caddy
# Admin panel
admin.{$DOMAIN} {
    reverse_proxy localhost:3001
}

# Editor interface  
editor.{$DOMAIN} {
    reverse_proxy localhost:3002
}
```

## Implementation Steps

### Step 1: Database Foundation (2 days)
1. Create migration system in core package
2. Add user/session tables from our schema
3. Update database.ts with user queries
4. Add authentication utilities (password hashing, sessions)

### Step 2: CLI Integration (1 day)
1. Update setup command to initialize database
2. Add admin user creation prompt
3. Migrate existing sites to admin user
4. Test setup process end-to-end

### Step 3: Admin Panel (2-3 days)
1. Create new admin interface with our design
2. Add login/authentication
3. Add user management (create, edit, delete users)
4. Add system settings (registration toggle, limits)
5. Integrate with main server routing

### Step 4: Editor Foundation (2-3 days)
1. Create editor package structure
2. Add login/register routes
3. Add basic dashboard showing user sites
4. Add new site creation (no editor yet, just basic form)
5. Setup subdomain routing in Caddy

### Step 5: Integration Testing (1 day)
1. Test complete setup flow
2. Test admin can create users
3. Test users can login to editor
4. Test users can create basic sites
5. Verify authentication works across subdomains

## Definition of Done for Stage 1

✅ **CLI Setup Enhanced**
- `deploy setup` creates admin user during initialization
- Database migrations run automatically
- Existing sites linked to admin user

✅ **Admin Panel Working**
- Admin can login at admin.yourdomain
- Admin can create/edit/delete users
- Admin can set per-user limits
- Admin can toggle registration on/off

✅ **Editor Basic Functionality**
- Users can login/register at editor.yourdomain (if enabled)
- Users see dashboard with their sites
- Users can create new sites (basic form, no editor yet)
- Session works across both subdomains

✅ **Authentication System**
- Secure password hashing
- Session management
- Cross-subdomain authentication
- Proper logout/session cleanup

## Testing Checklist

- [ ] Fresh setup creates admin user
- [ ] Admin login works
- [ ] Admin can create test user
- [ ] Test user can login to editor
- [ ] Test user can create site
- [ ] Sessions persist across page reloads
- [ ] Logout works on both subdomains
- [ ] Registration can be disabled
- [ ] User limits are enforced

## Next Stage Preview

Stage 2 will add:
- CodeMirror 6 editor interface
- File tree view
- Basic file operations
- Template system for new sites
- Site editing functionality

This gives us a solid foundation to build the editor on!