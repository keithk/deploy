import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { validateSession, destroySession, createSession } from '../../core/auth/sessions';
import { verifyPassword } from '../../core/auth/password';
import { UserModel } from '../../core/database/models/user';

// Helper functions
function getClientIP(request: Request): string {
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  const xRealIP = request.headers.get('x-real-ip');
  if (xRealIP) {
    return xRealIP.trim();
  }
  return 'unknown';
}

function getUserAgent(request: Request): string {
  return request.headers.get('user-agent') || 'Unknown';
}

const userModel = new UserModel();
const authRoutes = new Hono();

// Middleware to check if user is already logged in
const redirectIfLoggedIn = async (c: any, next: any) => {
  const sessionId = getCookie(c, 'session');
  if (sessionId) {
    const user = await validateSession(sessionId);
    if (user?.is_admin) {
      return c.redirect('/dashboard');
    }
  }
  await next();
};

// Middleware to require admin authentication
export const requireAdmin = async (c: any, next: any) => {
  const sessionId = getCookie(c, 'session');
  if (!sessionId) {
    return c.redirect('/auth/login');
  }
  
  const user = await validateSession(sessionId);
  if (!user || !user.is_admin) {
    deleteCookie(c, 'session');
    return c.redirect('/auth/login');
  }
  
  c.set('user', user);
  await next();
};

// Login page
authRoutes.get('/login', redirectIfLoggedIn, (c) => {
  const error = c.req.query('error');
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin Login - Dial Up Deploy</title>
      <link rel="stylesheet" href="/static/admin.css">
    </head>
    <body>
      <div class="login-container">
        <form class="login-box" method="POST" action="/auth/login">
          <div class="login-title">ADMIN ACCESS</div>
          
          ${error ? `<div class="message error">${error}</div>` : ''}
          
          <div class="form-group">
            <label class="form-label" for="username">Username:</label>
            <input 
              type="text" 
              id="username" 
              name="username" 
              class="form-input" 
              required 
              autocomplete="username"
              placeholder="admin"
            >
          </div>
          
          <div class="form-group">
            <label class="form-label" for="password">Password:</label>
            <input 
              type="password" 
              id="password" 
              name="password" 
              class="form-input" 
              required 
              autocomplete="current-password"
              placeholder="••••••••"
            >
          </div>
          
          <div class="form-group">
            <button type="submit" class="btn primary" style="width: 100%;">
              [AUTHENTICATE]
            </button>
          </div>
          
          <div style="text-align: center; margin-top: 2rem; color: var(--text-secondary); font-size: 0.8rem;">
            Made with ❤️ in mono
          </div>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Login handler
authRoutes.post('/login', async (c) => {
  const { username, password } = await c.req.parseBody();
  
  if (!username || !password) {
    return c.redirect('/auth/login?error=Username and password required');
  }
  
  try {
    // Find user by username
    console.log('Login attempt for username:', username);
    const user = userModel.getUserByUsername(username as string);
    console.log('User found:', user ? `${user.username} (admin: ${user.is_admin}, active: ${user.is_active})` : 'null');
    
    if (!user || !user.is_admin || !user.is_active) {
      return c.redirect('/auth/login?error=Invalid credentials or access denied');
    }
    
    // Verify password
    console.log('Verifying password...');
    const isValidPassword = await verifyPassword(password as string, user.password_hash);
    console.log('Password valid:', isValidPassword);
    
    if (!isValidPassword) {
      return c.redirect('/auth/login?error=Invalid credentials');
    }
    
    // Create session
    const clientIP = getClientIP(c.req.raw);
    const userAgent = getUserAgent(c.req.raw);
    const sessionId = await createSession(user.id, clientIP, userAgent, 24); // 24 hour session
    
    // Set session cookie
    setCookie(c, 'session', sessionId, {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'Lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/'
    });
    
    return c.redirect('/dashboard');
    
  } catch (error) {
    console.error('Login error:', error);
    return c.redirect('/auth/login?error=Login failed, please try again');
  }
});

// Logout handler
authRoutes.post('/logout', async (c) => {
  const sessionId = getCookie(c, 'session');
  
  if (sessionId) {
    await destroySession(sessionId);
  }
  
  deleteCookie(c, 'session');
  return c.redirect('/auth/login');
});

// Logout GET redirect (for convenience)
authRoutes.get('/logout', async (c) => {
  const sessionId = getCookie(c, 'session');
  
  if (sessionId) {
    await destroySession(sessionId);
  }
  
  deleteCookie(c, 'session');
  return c.redirect('/auth/login');
});

export { authRoutes };