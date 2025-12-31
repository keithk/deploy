// ABOUTME: Tests for SSHAuthServer to verify public key authentication and session creation.
// ABOUTME: Uses mock keys and in-memory database for isolated testing.

import { describe, test, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Client } from "ssh2";
import { generateKeyPairSync } from "crypto";

// Mock the core module before importing SSHAuthServer
const mockSession = { token: "test-token-123", id: "session-id", created_at: new Date().toISOString(), expires_at: new Date().toISOString() };
mock.module("@keithk/deploy-core", () => ({
  sessionModel: {
    create: () => mockSession,
  },
  info: () => {},
  debug: () => {},
}));

// Now import SSHAuthServer after mocking
const { SSHAuthServer } = await import("../src/auth/ssh-server");
type SSHAuthConfig = import("../src/auth/ssh-server").SSHAuthConfig;

describe("SSHAuthServer", () => {
  let tempDir: string;
  let hostKeyPath: string;
  let authorizedKeysPath: string;
  let config: SSHAuthConfig;
  let server: typeof SSHAuthServer.prototype;
  let testPrivateKey: string;
  let testPublicKey: string;

  beforeAll(async () => {
    // Create temp directory for test keys
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssh-test-"));
    hostKeyPath = path.join(tempDir, "host_key");
    authorizedKeysPath = path.join(tempDir, "authorized_keys");

    // Generate host key
    const { privateKey: hostPrivate } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
    });
    fs.writeFileSync(hostKeyPath, hostPrivate);

    // Generate test user key pair
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    testPrivateKey = privateKey;

    // Convert public key to OpenSSH format for authorized_keys
    const sshPubKey = generateOpenSSHKey(publicKey);
    testPublicKey = sshPubKey;
    fs.writeFileSync(authorizedKeysPath, `${sshPubKey} test@example.com\n`);
  });

  afterAll(async () => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    config = {
      port: 0, // Use random available port
      hostKeyPath,
      authorizedKeysPath,
      dashboardUrl: "https://keith.business",
    };
  });

  test("should load authorized keys from file", async () => {
    server = new SSHAuthServer(config);
    const keys = server.loadAuthorizedKeys();
    expect(keys.length).toBe(1);
    await server.stop();
  });

  test("should parse authorized_keys with multiple entries", async () => {
    // Add another key
    const { publicKey: pub2 } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const sshPubKey2 = generateOpenSSHKey(pub2);
    fs.writeFileSync(
      authorizedKeysPath,
      `${testPublicKey} test@example.com\n${sshPubKey2} other@example.com\n`
    );

    server = new SSHAuthServer(config);
    const keys = server.loadAuthorizedKeys();
    expect(keys.length).toBe(2);
    await server.stop();

    // Restore single key
    fs.writeFileSync(authorizedKeysPath, `${testPublicKey} test@example.com\n`);
  });

  test("should start and stop server", async () => {
    server = new SSHAuthServer(config);
    await server.start();
    const port = server.getPort();
    expect(port).toBeGreaterThan(0);
    await server.stop();
  });

  test("should reject invalid public key", async () => {
    server = new SSHAuthServer(config);
    await server.start();
    const port = server.getPort();

    // Generate a different key pair (not in authorized_keys)
    const { privateKey: wrongKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });

    const result = await attemptSSHConnection(port, wrongKey);
    expect(result.success).toBe(false);
    expect(result.error).toContain("authentication");

    await server.stop();
  });

  test("should authenticate valid public key and show welcome", async () => {
    server = new SSHAuthServer(config);
    await server.start();
    const port = server.getPort();

    const result = await attemptSSHConnection(port, testPrivateKey);
    expect(result.success).toBe(true);
    expect(result.output).toContain("Welcome to Deploy");
    expect(result.output).toContain("Dashboard:");
    expect(result.output).toContain("token=test-token-123");

    await server.stop();
  });
});

// Helper to convert PEM public key to OpenSSH format
function generateOpenSSHKey(pemPublicKey: string): string {
  const { execSync } = require("child_process");

  // Write PEM to temp file
  const tempPem = `/tmp/temp_key_${Date.now()}.pem`;
  fs.writeFileSync(tempPem, pemPublicKey);

  try {
    // Convert using ssh-keygen
    const result = execSync(`ssh-keygen -i -m PKCS8 -f ${tempPem}`, {
      encoding: "utf8",
    });
    return result.trim();
  } finally {
    fs.unlinkSync(tempPem);
  }
}

// Helper to attempt SSH connection
async function attemptSSHConnection(
  port: number,
  privateKey: string
): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const client = new Client();

    const timeout = setTimeout(() => {
      client.end();
      resolve({ success: false, error: "Connection timeout" });
    }, 5000);

    client.on("ready", () => {
      let output = "";
      client.shell((err, stream) => {
        if (err) {
          clearTimeout(timeout);
          client.end();
          resolve({ success: false, error: err.message });
          return;
        }

        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.on("close", () => {
          clearTimeout(timeout);
          client.end();
          resolve({ success: true, output });
        });
      });
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });

    client.connect({
      host: "127.0.0.1",
      port,
      username: "deploy",
      privateKey,
    });
  });
}
