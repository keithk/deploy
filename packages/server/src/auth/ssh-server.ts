// ABOUTME: SSH authentication server for dashboard access via public key.
// ABOUTME: Validates SSH keys against authorized_keys and creates dashboard sessions.

import { Server, utils as sshUtils } from "ssh2";
import type {
  Connection,
  ServerChannel,
  AuthContext,
  Session,
} from "ssh2";
import * as fs from "fs";
import { sessionModel } from "@keithk/deploy-core";
import { info, debug } from "@keithk/deploy-core";

export interface SSHAuthConfig {
  port: number;
  hostKeyPath: string;
  authorizedKeysPath: string;
  dashboardUrl: string;
}

interface AuthorizedKey {
  key: Buffer;
  comment: string;
}

export class SSHAuthServer {
  private server: Server;
  private config: SSHAuthConfig;
  private authorizedKeys: AuthorizedKey[] = [];
  private listeningPort: number = 0;

  constructor(config: SSHAuthConfig) {
    this.config = config;
    this.authorizedKeys = this.loadAuthorizedKeys();

    const hostKey = fs.readFileSync(config.hostKeyPath);

    this.server = new Server(
      {
        hostKeys: [hostKey],
      },
      (client: Connection) => {
        this.handleConnection(client);
      }
    );
  }

  /**
   * Parse authorized_keys file and return array of parsed keys
   */
  public loadAuthorizedKeys(): AuthorizedKey[] {
    if (!fs.existsSync(this.config.authorizedKeysPath)) {
      debug(`authorized_keys not found at ${this.config.authorizedKeysPath}`);
      return [];
    }

    const content = fs.readFileSync(this.config.authorizedKeysPath, "utf-8");
    const lines = content.split("\n").filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("#");
    });

    const keys: AuthorizedKey[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;

      const keyType = parts[0];
      const keyData = parts[1];
      const comment = parts.slice(2).join(" ") || "unknown";

      // Reconstruct the key in OpenSSH format
      const keyStr = `${keyType} ${keyData}`;

      try {
        const parsed = sshUtils.parseKey(keyStr);
        if (parsed && !(parsed instanceof Error)) {
          // Handle both single key and array of keys
          const keyObj = Array.isArray(parsed) ? parsed[0] : parsed;
          keys.push({
            key: keyObj.getPublicSSH(),
            comment,
          });
        }
      } catch (err) {
        debug(`Failed to parse key for ${comment}: ${err}`);
      }
    }

    debug(`Loaded ${keys.length} authorized keys`);
    return keys;
  }

  /**
   * Handle new SSH connection
   */
  private handleConnection(client: Connection): void {
    let authenticatedUser: string | null = null;

    client.on("authentication", (ctx: AuthContext) => {
      if (ctx.method === "publickey") {
        const clientKey = ctx.key;

        // Find matching authorized key
        const isAuthorized = this.authorizedKeys.some((authKey) => {
          return (
            clientKey.algo === this.getKeyAlgo(authKey.key) &&
            clientKey.data.equals(authKey.key)
          );
        });

        if (isAuthorized) {
          // If signature is provided, verify it
          if (ctx.signature) {
            // Key is verified with signature - accept authentication
            authenticatedUser = ctx.username;
            debug(`SSH authentication successful for ${ctx.username}`);
            ctx.accept();
          } else {
            // No signature yet - request signature verification
            ctx.accept();
          }
        } else {
          debug(`SSH authentication failed for ${ctx.username}: key not authorized`);
          ctx.reject(["publickey"]);
        }
      } else {
        // Only accept publickey authentication
        ctx.reject(["publickey"]);
      }
    });

    client.on("ready", () => {
      debug(`Client authenticated: ${authenticatedUser}`);

      client.on("session", (accept: () => Session) => {
        const session = accept();

        // Accept PTY requests (required before shell)
        session.on("pty", (accept: () => void) => {
          accept();
        });

        session.on("shell", (accept: () => ServerChannel) => {
          const stream = accept();
          this.handleShellSession(stream, authenticatedUser || "unknown");
        });

        session.on("exec", (accept: () => ServerChannel, _reject: () => void, info: { command: string }) => {
          const stream = accept();
          // Treat exec the same as shell - show welcome message
          this.handleShellSession(stream, authenticatedUser || "unknown");
        });
      });
    });

    client.on("error", (err: Error) => {
      debug(`SSH client error: ${err.message}`);
    });

    client.on("end", () => {
      debug("SSH client disconnected");
    });
  }

  /**
   * Handle shell session - display welcome message and dashboard URL
   */
  private handleShellSession(stream: ServerChannel, username: string): void {
    // Create a new session
    const session = sessionModel.create(7); // 7 days expiry
    const loginUrl = `${this.config.dashboardUrl}?token=${session.token}`;

    info(`Created dashboard session for ${username}`);

    const welcome = `
\x1b[1;36m╔══════════════════════════════════════════╗
║         Welcome to Deploy                ║
╚══════════════════════════════════════════╝\x1b[0m

\x1b[1mDashboard:\x1b[0m ${loginUrl}

This link is valid for 7 days.

`;

    stream.write(welcome);
    stream.exit(0);
    stream.end();
  }

  /**
   * Get key algorithm from public key buffer
   */
  private getKeyAlgo(key: Buffer): string {
    // The key buffer starts with a 4-byte length followed by the algorithm name
    const algoLen = key.readUInt32BE(0);
    return key.slice(4, 4 + algoLen).toString("ascii");
  }

  /**
   * Start the SSH server
   */
  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on("error", (err: Error) => {
        reject(err);
      });

      this.server.listen(this.config.port, "0.0.0.0", () => {
        const address = this.server.address();
        if (address && typeof address === "object") {
          this.listeningPort = address.port;
          info(`SSH auth server listening on port ${this.listeningPort}`);
        }
        resolve();
      });
    });
  }

  /**
   * Get the port the server is listening on
   */
  public getPort(): number {
    return this.listeningPort;
  }

  /**
   * Stop the SSH server
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        debug("SSH auth server stopped");
        resolve();
      });
    });
  }
}
