/**
 * Generate a cryptographically secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a session token (longer for security)
 */
export function generateSessionToken(): string {
  return generateSecureToken(64); // 128 character hex string
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

/**
 * Validate username format
 */
export function validateUsername(username: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (username.length < 3) {
    errors.push("Username must be at least 3 characters long");
  }
  
  if (username.length > 50) {
    errors.push("Username must be no more than 50 characters long");
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    errors.push("Username can only contain letters, numbers, hyphens, and underscores");
  }
  
  if (/^[0-9]/.test(username)) {
    errors.push("Username cannot start with a number");
  }
  
  // Reserved usernames
  const reservedUsernames = [
    "admin", "administrator", "root", "system", "api", "www", "mail", 
    "ftp", "editor", "support", "help", "info", "contact", "about",
    "blog", "news", "shop", "store", "app", "dashboard", "panel"
  ];
  
  if (reservedUsernames.includes(username.toLowerCase())) {
    errors.push("This username is reserved");
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Extract IP address from request headers (for session tracking)
 */
export function getClientIP(request: Request): string {
  // Check common proxy headers
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0]?.trim() || 'unknown';
  }
  
  const xRealIP = request.headers.get('x-real-ip');
  if (xRealIP) {
    return xRealIP.trim();
  }
  
  // Fallback to connection info if available
  return 'unknown';
}

/**
 * Parse User-Agent for session tracking
 */
export function getUserAgent(request: Request): string {
  return request.headers.get('user-agent') || 'Unknown';
}

/**
 * Middleware to redirect if already authenticated
 */
export async function redirectIfAuthenticated(c: any, next: any) {
  const sessionToken = c.req.cookie('session');
  if (sessionToken) {
    const { validateSession } = await import('./sessions');
    const user = await validateSession(sessionToken);
    if (user) {
      const path = c.req.path;
      if (path.includes('/admin/')) {
        return c.redirect('/admin/dashboard');
      } else {
        return c.redirect('/dashboard');
      }
    }
  }
  return next();
}

/**
 * Handle login for admin or editor
 */
export async function handleLogin(
  c: any,
  username: string,
  password: string,
  type: 'admin' | 'editor' = 'editor'
): Promise<{ success: boolean; error?: string; user?: any }> {
  const { UserModel } = await import('../database/models/user');
  const { verifyPassword } = await import('./password');
  const { createSession } = await import('./sessions');
  const { createSessionCookie } = await import('./middleware');
  
  const userModel = new UserModel();
  
  try {
    const user = await userModel.getUserByUsername(username);
    
    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }
    
    if (type === 'admin' && !user.is_admin) {
      return { success: false, error: 'Admin access required' };
    }
    
    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return { success: false, error: 'Invalid credentials' };
    }
    
    const clientIP = getClientIP(c.req.raw);
    const userAgent = getUserAgent(c.req.raw);
    const sessionId = await createSession(user.id, clientIP, userAgent);
    
    const cookie = createSessionCookie(sessionId);
    c.header('Set-Cookie', cookie);
    
    return { success: true, user };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'Login failed' };
  }
}

/**
 * Handle logout
 */
export async function handleLogout(c: any) {
  const sessionToken = c.req.cookie('session');
  if (sessionToken) {
    const { destroySession } = await import('./sessions');
    await destroySession(sessionToken);
  }
  
  c.header('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/');
}