import { password as bunPassword } from "bun";

/**
 * Hash a password using Bun's built-in bcrypt implementation
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  try {
    return await bunPassword.hash(plainPassword, {
      algorithm: "bcrypt",
      cost: 12, // Good balance of security vs performance
    });
  } catch (error) {
    throw new Error(`Failed to hash password: ${error}`);
  }
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  try {
    return await bunPassword.verify(plainPassword, hashedPassword);
  } catch (error) {
    // Return false on any error to prevent timing attacks
    return false;
  }
}

/**
 * Generate a secure random password
 */
export function generateRandomPassword(length: number = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  
  return password;
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }
  
  if (password.length > 128) {
    errors.push("Password must be no more than 128 characters long");
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  
  if (!/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  
  // Check for common weak passwords
  const commonPasswords = [
    "password", "123456", "password123", "admin", "letmein", 
    "welcome", "monkey", "1234567890", "qwerty", "abc123"
  ];
  
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push("Password is too common, please choose a different one");
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}