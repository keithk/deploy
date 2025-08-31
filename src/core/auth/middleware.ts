import { validateSession } from "./sessions";
import { UserData } from "../database/models/user";

export interface AuthenticatedRequest extends Request {
  user?: UserData;
  sessionId?: string;
}

/**
 * Extract session token from request
 * Checks both cookies and Authorization header
 */
function getSessionToken(request: Request): string | null {
  // Check Authorization header first (for API calls)
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check cookies (for web requests)
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    return cookies['session'] || null;
  }
  
  return null;
}

/**
 * Simple cookie parser
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = rest.join('=');
    }
  });
  
  return cookies;
}

/**
 * Middleware to require authentication
 */
export async function requireAuth(
  request: AuthenticatedRequest,
  handler: (req: AuthenticatedRequest) => Promise<Response>
): Promise<Response> {
  const sessionToken = getSessionToken(request);
  
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const user = await validateSession(sessionToken);
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Attach user and session to request
  request.user = user;
  request.sessionId = sessionToken;
  
  return handler(request);
}

/**
 * Middleware to require admin privileges
 */
export async function requireAdmin(
  request: AuthenticatedRequest,
  handler: (req: AuthenticatedRequest) => Promise<Response>
): Promise<Response> {
  return requireAuth(request, async (req) => {
    if (!req.user?.is_admin) {
      return new Response(JSON.stringify({ error: 'Admin privileges required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return handler(req);
  });
}

/**
 * Optional auth middleware - adds user to request if authenticated, but doesn't require it
 */
export async function optionalAuth(
  request: AuthenticatedRequest,
  handler: (req: AuthenticatedRequest) => Promise<Response>
): Promise<Response> {
  const sessionToken = getSessionToken(request);
  
  if (sessionToken) {
    const user = await validateSession(sessionToken);
    if (user) {
      request.user = user;
      request.sessionId = sessionToken;
    }
  }
  
  return handler(request);
}

/**
 * Helper function to create session cookie
 */
export function createSessionCookie(sessionId: string, secure: boolean = false): string {
  const maxAge = 24 * 60 * 60; // 24 hours in seconds
  
  return `session=${sessionId}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Path=/${secure ? '; Secure' : ''}`;
}

/**
 * Helper function to create logout cookie (expires the session cookie)
 */
export function createLogoutCookie(): string {
  return 'session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/';
}

/**
 * Check if request is from same domain (CSRF protection)
 */
export function validateOrigin(request: Request, allowedOrigins: string[]): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  
  // For API requests, check Origin header
  if (origin) {
    return allowedOrigins.some(allowed => origin === allowed || origin.endsWith(allowed));
  }
  
  // For form submissions, check Referer header
  if (referer) {
    return allowedOrigins.some(allowed => referer.startsWith(allowed));
  }
  
  // If neither header is present, reject for POST/PUT/DELETE requests
  const method = request.method.toUpperCase();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return false;
  }
  
  // Allow GET requests without origin/referer checks
  return true;
}