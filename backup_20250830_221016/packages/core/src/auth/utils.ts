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
    return xForwardedFor.split(',')[0].trim();
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