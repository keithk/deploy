// ABOUTME: AES-256-GCM encryption for secrets at rest (env_vars in SQLite).
// ABOUTME: Requires DEPLOY_ENCRYPTION_KEY; falls back to plaintext with a warning.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ENCRYPTION_KEY_ENV = "DEPLOY_ENCRYPTION_KEY";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV is standard for GCM
const TAG_LENGTH = 16; // 128-bit auth tag
const PREFIX = "enc:";

let cachedKey: Buffer | null = null;
let warnedAboutKey = false;

/**
 * Derive a 32-byte key from the DEPLOY_ENCRYPTION_KEY env var.
 * The user provides a passphrase; we SHA-256 it to get exactly 32 bytes.
 * Cached after first call.
 */
function getEncryptionKey(): Buffer | null {
  if (cachedKey !== null) return cachedKey;

  const passphrase = process.env[ENCRYPTION_KEY_ENV];
  if (!passphrase) {
    if (!warnedAboutKey) {
      // Only warn once to avoid log spam during boot loops.
      console.warn(
        `[crypto] ${ENCRYPTION_KEY_ENV} is not set — env_vars will be stored in plaintext. ` +
          `Set ${ENCRYPTION_KEY_ENV} in your .env for encryption at rest.`
      );
      warnedAboutKey = true;
    }
    return null;
  }

  cachedKey = createHash("sha256").update(passphrase).digest();
  return cachedKey;
}

/**
 * Encrypt a plaintext string into an `enc:<iv>:<tag>:<ciphertext>` blob.
 * Returns the original string if no encryption key is configured (plaintext mode).
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a string produced by `encrypt()`.
 * If the input doesn't start with `enc:`, it's treated as plaintext (backward compat
 * with data written before encryption was enabled).
 */
export function decrypt(value: string): string {
  if (!value.startsWith(PREFIX)) {
    // Plaintext (pre-encryption data, or encryption disabled).
    return value;
  }

  const key = getEncryptionKey();
  if (!key) {
    // We have encrypted data but no key — can't decrypt. This is a misconfiguration.
    throw new Error(
      `Encrypted data found but ${ENCRYPTION_KEY_ENV} is not set. ` +
        `Cannot decrypt env_vars without the encryption key.`
    );
  }

  const payload = value.slice(PREFIX.length);
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted value (expected enc:<iv>:<tag>:<ciphertext>)");
  }

  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const ciphertext = Buffer.from(parts[2], "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Check whether encryption is currently enabled (key is configured).
 */
export function isEncryptionEnabled(): boolean {
  return getEncryptionKey() !== null;
}
