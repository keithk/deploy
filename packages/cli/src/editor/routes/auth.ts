import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Database } from '@keithk/deploy-core/src/database/database';
import { verifyPassword } from '@keithk/deploy-core/src/auth/password';
import { createSession, validateSession, destroySession } from '@keithk/deploy-core/src/auth/sessions';

const authRoutes = new Hono();

// Middleware to check authentication
export async function requireAuth(c: any, next: any) {
  const sessionId = getCookie(c, 'editor_session');
  
  if (!sessionId) {
    return c.redirect('/auth/login');
  }
  
  try {
    const db = Database.getInstance();
    const user = await validateSession(sessionId);
    
    if (!user) {
      deleteCookie(c, 'editor_session');
      return c.redirect('/auth/login');
    }
    
    c.set('user', user);
    await next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    deleteCookie(c, 'editor_session');
    return c.redirect('/auth/login');
  }
}

// Login page
authRoutes.get('/login', async (c) => {
  const error = c.req.query('error');
  const message = c.req.query('message');
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login - Code Editor</title>
      <link rel="stylesheet" href="/static/editor.css">
    </head>
    <body>
      <div class="auth-container">
        <div class="auth-card">
          <h1 class="auth-title">Code Editor</h1>
          <p class="auth-subtitle">Sign in to manage your sites</p>
          
          ${error ? `<div class="message error">${error}</div>` : ''}
          ${message ? `<div class="message info">${message}</div>` : ''}
          
          <form method="POST" action="/auth/login" class="auth-form">
            <div class="form-group">
              <label class="form-label" for="username">Username</label>
              <input 
                type="text" 
                id="username" 
                name="username" 
                class="form-input" 
                required
                autocomplete="username"
              >
            </div>
            
            <div class="form-group">
              <label class="form-label" for="password">Password</label>
              <input 
                type="password" 
                id="password" 
                name="password" 
                class="form-input" 
                required
                autocomplete="current-password"
              >
            </div>
            
            <button type="submit" class="btn primary">Sign In</button>
          </form>
          
          <div class="auth-footer">
            <p>Need an account? <a href="/auth/register">Register here</a></p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Login form submission
authRoutes.post('/login', async (c) => {
  const formData = await c.req.parseBody();
  const { username, password } = formData;
  
  if (!username || !password) {
    return c.redirect('/auth/login?error=Please enter both username and password');
  }
  
  try {
    const db = Database.getInstance();
    const users = db.query<{ id: number; username: string; password_hash: string; is_active: boolean }>(
      `SELECT id, username, password_hash, is_active FROM users WHERE username = ? AND is_active = 1`,
      [username]
    );
    
    if (users.length === 0) {
      return c.redirect('/auth/login?error=Invalid username or password');
    }
    
    const user = users[0];
    const isValid = await verifyPassword(password as string, user.password_hash);
    
    if (!isValid) {
      return c.redirect('/auth/login?error=Invalid username or password');
    }
    
    // Update last login
    db.run(
      `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`,
      [user.id]
    );
    
    // Create session
    const sessionId = await createSession(user.id);
    
    // Set cookie
    setCookie(c, 'editor_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });
    
    return c.redirect('/dashboard');
    
  } catch (error) {
    console.error('Login error:', error);
    return c.redirect('/auth/login?error=Login failed. Please try again.');
  }
});

// Registration page
authRoutes.get('/register', async (c) => {
  try {
    const db = Database.getInstance();
    
    // Check if registration is enabled
    const settings = db.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'registration_enabled'`
    );
    
    const registrationEnabled = settings[0]?.value === 'true';
    
    if (!registrationEnabled) {
      return c.redirect('/auth/login?message=Registration is currently disabled');
    }
    
    const error = c.req.query('error');
    
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Register - Code Editor</title>
        <link rel="stylesheet" href="/static/editor.css">
      </head>
      <body>
        <div class="auth-container">
          <div class="auth-card">
            <h1 class="auth-title">Join Code Editor</h1>
            <p class="auth-subtitle">Create an account to start building</p>
            
            ${error ? `<div class="message error">${error}</div>` : ''}
            
            <form method="POST" action="/auth/register" class="auth-form">
              <div class="form-group">
                <label class="form-label" for="username">Username</label>
                <input 
                  type="text" 
                  id="username" 
                  name="username" 
                  class="form-input" 
                  required
                  pattern="[a-zA-Z0-9_-]{3,20}"
                  title="3-20 characters, letters, numbers, underscore, or hyphen only"
                >
              </div>
              
              <div class="form-group">
                <label class="form-label" for="email">Email</label>
                <input 
                  type="email" 
                  id="email" 
                  name="email" 
                  class="form-input" 
                  required
                >
              </div>
              
              <div class="form-group">
                <label class="form-label" for="password">Password</label>
                <input 
                  type="password" 
                  id="password" 
                  name="password" 
                  class="form-input" 
                  required
                  minlength="6"
                >
              </div>
              
              <div class="form-group">
                <label class="form-label" for="password_confirm">Confirm Password</label>
                <input 
                  type="password" 
                  id="password_confirm" 
                  name="password_confirm" 
                  class="form-input" 
                  required
                >
              </div>
              
              <button type="submit" class="btn primary">Create Account</button>
            </form>
            
            <div class="auth-footer">
              <p>Already have an account? <a href="/auth/login">Sign in here</a></p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Registration page error:', error);
    return c.redirect('/auth/login?error=Registration unavailable');
  }
});

// Registration form submission
authRoutes.post('/register', async (c) => {
  const formData = await c.req.parseBody();
  const { username, email, password, password_confirm } = formData;
  
  if (!username || !email || !password || !password_confirm) {
    return c.redirect('/auth/register?error=All fields are required');
  }
  
  if (password !== password_confirm) {
    return c.redirect('/auth/register?error=Passwords do not match');
  }
  
  try {
    const db = Database.getInstance();
    
    // Check if registration is still enabled
    const settings = db.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'registration_enabled'`
    );
    
    if (settings[0]?.value !== 'true') {
      return c.redirect('/auth/login?message=Registration is currently disabled');
    }
    
    // Check if username or email already exists
    const existing = db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM users WHERE username = ? OR email = ?`,
      [username, email]
    );
    
    if (existing[0].count > 0) {
      return c.redirect('/auth/register?error=Username or email already exists');
    }
    
    // Get default user limits from settings
    const defaultSettings = db.query<{ key: string; value: string }>(
      `SELECT key, value FROM system_settings WHERE key IN ('default_max_sites', 'default_max_memory', 'default_max_cpu', 'default_max_storage')`
    );
    
    const defaults = Object.fromEntries(defaultSettings.map(s => [s.key, s.value]));
    
    // Hash password
    const { hashPassword } = await import('@keithk/deploy-core/src/auth/password');
    const passwordHash = await hashPassword(password as string);
    
    // Create user
    db.run(
      `INSERT INTO users (username, email, password_hash, max_sites, max_memory_mb, max_cpu_cores, max_storage_mb, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        username,
        email,
        passwordHash,
        parseInt(defaults.default_max_sites || '3'),
        parseInt(defaults.default_max_memory || '512'),
        parseFloat(defaults.default_max_cpu || '0.5'),
        parseInt(defaults.default_max_storage || '1024')
      ]
    );
    
    return c.redirect('/auth/login?message=Account created successfully! Please sign in.');
    
  } catch (error) {
    console.error('Registration error:', error);
    return c.redirect('/auth/register?error=Registration failed. Please try again.');
  }
});

// Logout
authRoutes.get('/logout', async (c) => {
  const sessionId = getCookie(c, 'editor_session');
  
  if (sessionId) {
    try {
      await destroySession(sessionId);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
  
  deleteCookie(c, 'editor_session');
  return c.redirect('/auth/login?message=Logged out successfully');
});

export { authRoutes };