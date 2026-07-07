# Dial Up Deploy MCP Server

The Dial Up Deploy MCP (Model Context Protocol) server enables you to manage your deployed sites conversationally through Claude Code or any MCP-compatible client. Instead of logging into the dashboard, you can ask Claude to list your sites, redeploy them, check logs, set custom domains, and manage environment variables.

## Quick Start

### 1. Create a Session Token

The MCP server authenticates to the admin API using a long-lived session token. Create one:

```bash
# SSH into your deploy server
ssh your-server

# Open a Node/Bun REPL and create a session token
bun

# Once in the REPL:
import { sessionModel } from '/path/to/deploy/packages/core/src/database/models/session.ts'
const token = sessionModel.create()
console.log(token.token)
```

You'll get a token like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

Store this securely. It doesn't expire (no TTL), but you can rotate it anytime by deleting the old token and creating a new one.

**Alternative (simpler for testing):** If you have direct access to the database, you can query it:

```bash
# On the deploy server
sqlite3 ~/.deploy/deploy.db "SELECT token FROM sessions LIMIT 1;"
```

Or create one via an existing authenticated session to the dashboard (e.g., by visiting admin.keith.is while logged in, opening DevTools, and grabbing the `session` cookie).

### 2. Build the MCP Server

From the project root:

```bash
bun install
bun run build:mcp
```

The server will be built to `packages/mcp/dist/index.js`.

### 3. Register with Claude Code

Create or update `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "deploy": {
      "command": "bun",
      "args": [
        "/absolute/path/to/deploy/packages/mcp/dist/index.js"
      ],
      "env": {
        "API_URL": "https://admin.keith.is",
        "SESSION_TOKEN": "your-session-token-here"
      }
    }
  }
}
```

**Important:** Use absolute paths, not relative paths, for the `command` and `args`.

Then restart Claude Code. The MCP server will auto-connect.

### 4. Use It

In Claude Code, you can now ask:

- "List all my sites"
- "What's the status of the atmobb site?"
- "Redeploy the blog site"
- "Show me the last 100 build logs for fc"
- "Add atmobb.app as a custom domain on atmobb"
- "Set the NODE_ENV variable to production on the residency-three-readings site"
- "Get the current environment variables for my movie-camp site"

## Environment Variables

The MCP server requires two environment variables:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SESSION_TOKEN` | Yes | None | A long-lived session token from the database. See "Create a Session Token" above. |
| `API_URL` | No | `https://admin.keith.is` | The base URL of your admin API (without trailing slash). Use `http://localhost:3000` for local testing. |

## Tools Available

### list_sites

Lists all deployed sites with their status, visibility, type, and access URLs.

**Usage in Claude:**
> "List all my sites"

**Output example:**
```json
[
  {
    "name": "atmobb",
    "id": "site-abc123",
    "status": "running",
    "visibility": "public",
    "type": "compose",
    "url": "https://atmobb.app",
    "last_deployed": "2026-07-06T12:34:56Z",
    "created": "2026-01-15T08:00:00Z"
  },
  ...
]
```

### get_site_status

Retrieves detailed information about a specific site, including container ID, port, build status, and configuration.

**Parameters:**
- `site` (string, required): Site name (e.g., "atmobb") or site ID

**Usage in Claude:**
> "Show me the detailed status of atmobb"

**Output example:**
```json
{
  "name": "atmobb",
  "id": "site-abc123",
  "status": "running",
  "visibility": "public",
  "type": "compose",
  "git_url": null,
  "branch": "main",
  "container_id": "abc123def456",
  "port": 5000,
  "custom_domains": ["atmobb.app"],
  "urls": ["https://atmobb.app"],
  "created_at": "2026-01-15T08:00:00Z",
  "last_deployed_at": "2026-07-06T12:34:56Z",
  "last_request_at": "2026-07-06T14:22:10Z",
  "sleep_enabled": false,
  "sleep_after_minutes": null,
  "autodeploy": true,
  "persistent_storage": true
}
```

### redeploy_site

Triggers a fresh deployment of the specified site.

**Parameters:**
- `site` (string, required): Site name or ID

**Usage in Claude:**
> "Redeploy the atmobb site"

**Output:**
```json
{
  "message": "Deployment triggered",
  "site_id": "site-abc123"
}
```

The deployment runs in the background. Check logs with the `get_logs` tool to monitor progress.

### get_logs

Retrieves build or runtime logs for a site. Build logs are stored in the database; runtime logs come directly from the Docker container.

**Parameters:**
- `site` (string, required): Site name or ID
- `type` (string, optional): "build" or "runtime" (defaults to both)
- `limit` (number, optional): Number of lines to retrieve (default: 50)

**Usage in Claude:**
> "Show me the last 100 build logs for the atmobb site"
> "Get runtime logs for fc"

**Output example:**
```json
[
  {
    "id": "build-1",
    "content": "Cloning repository...",
    "timestamp": "2026-07-06T12:34:00Z",
    "type": "build"
  },
  {
    "id": "build-2",
    "content": "Building Docker image...",
    "timestamp": "2026-07-06T12:35:00Z",
    "type": "build"
  },
  ...
]
```

### set_custom_domains

Sets the full list of custom domains for a site, replacing any existing ones. Once set, Deploy's on-demand TLS will automatically request certificates for the domains (if enabled). The domains will resolve to the site's container.

**Parameters:**
- `site` (string, required): Site name or ID
- `domains` (array of strings, required): Custom domains (e.g., `["atmobb.app", "hv.atmobb.app"]`), or an empty array to remove all

**Prerequisites:**
- Each domain must be DNS-pointed to your Deploy server (via A record or CNAME)
- If on-demand TLS is enabled, certificates are automatic
- If on-demand TLS is disabled, manually add each domain to your Caddyfile

**Usage in Claude:**
> "Add atmobb.app and hv.atmobb.app as custom domains on atmobb"
> "Remove all custom domains from the blog site"

**Output example:**
```json
{
  "message": "Custom domains updated",
  "custom_domains": ["atmobb.app", "hv.atmobb.app"],
  "urls": ["https://atmobb.app", "https://hv.atmobb.app"]
}
```

### manage_env_vars

Gets or sets environment variables for a site. Environment variables are stored per-site and merged with system variables (like `PORT`) at build/runtime.

**Parameters:**
- `site` (string, required): Site name or ID
- `action` (string, required): "get" or "set"
- `vars` (object, optional): When `action="set"`, provide a JSON object with KEY/VALUE pairs

**Usage in Claude (get):**
> "Show me the environment variables for atmobb"

**Output example:**
```json
{
  "user": {
    "NODE_ENV": "production",
    "API_KEY": "secret123"
  },
  "system": {
    "PORT": "5000",
    "DATA_DIR": "/data"
  },
  "note": "System vars are set automatically. User vars take effect on next build/redeploy."
}
```

**Usage in Claude (set):**
> "Set NODE_ENV to production and LOG_LEVEL to debug on the blog site"

**Example request (conceptually):**
```
action: "set"
vars: {
  "NODE_ENV": "production",
  "LOG_LEVEL": "debug"
}
```

**Output:**
```json
{
  "message": "Environment variables updated",
  "env_vars": {
    "NODE_ENV": "production",
    "LOG_LEVEL": "debug"
  },
  "note": "Changes take effect on next build/redeploy"
}
```

**Important:** Environment variable changes do NOT trigger an automatic redeploy. After setting vars, ask Claude to "Redeploy the [site] site" to apply them.

## Troubleshooting

### "Session token invalid" or "Unauthorized" errors

1. Verify the `SESSION_TOKEN` env var is set correctly in `claude_desktop_config.json`
2. Check that the session token exists in the database:
   ```bash
   sqlite3 ~/.deploy/deploy.db "SELECT token FROM sessions WHERE token='your-token-here';"
   ```
3. If the token is missing, create a new one (see "Create a Session Token")

### "Site not found"

The MCP server resolves site names to IDs by querying all sites. If it can't find a site by name, verify:
1. The site exists: "List all my sites"
2. The site name is correct (case-sensitive)
3. You have API access to the site (it should be listed even if private)

### "Network error" or connection fails

1. Verify the `API_URL` env var is correct (defaults to `https://admin.keith.is`)
2. If using a non-HTTPS URL (e.g., localhost), ensure your MCP client accepts it
3. Check that the deploy server is running: `systemctl status deploy.service`
4. Verify network connectivity: `curl https://admin.keith.is/api/sites?token=your-token`

### MCP server doesn't appear in Claude Code

1. Check that Claude Code has been restarted after updating the config
2. Verify the `command` and `args` paths are absolute and correct:
   ```bash
   bun /absolute/path/to/packages/mcp/dist/index.js
   # Should print: "[Deploy MCP] Server started. Connected to API at: ..."
   ```
3. Check Claude Code's logs (usually in `~/.claude/logs/` or the terminal where Claude Code was launched)

### Tools are not listed in Claude

1. Restart Claude Code
2. Check that the MCP server is running (it should print a message to stderr when started)
3. Try asking Claude to "List my deployment tools" or "What tools do you have?"

## Advanced

### Running the MCP Server Locally for Testing

To test without setting up Claude Code:

```bash
# From the project root
SESSION_TOKEN=your-token-here API_URL=https://admin.keith.is bun packages/mcp/dist/index.js
```

The server will print to stderr when connected. To send commands, you need an MCP client library (e.g., Claude Code itself, or a Node.js MCP test harness).

### Session Token Management

Session tokens are stored in the database and have no expiration. To rotate:

```bash
# Delete the old token
sqlite3 ~/.deploy/deploy.db "DELETE FROM sessions WHERE token='old-token';"

# Create a new one (see "Create a Session Token" above)
```

To list all active sessions:

```bash
sqlite3 ~/.deploy/deploy.db "SELECT token, created_at FROM sessions;"
```

### Monitoring

The MCP server logs initialization messages to stderr (where Claude Code can see them). For debugging, you can also add `LOG_LEVEL=1` (or higher) to the env vars in your config.

## Support & Feedback

For issues, feature requests, or questions:
1. Check the main Deploy README at `/Volumes/Carrie/projects/deploy/README.md`
2. Review the deployment logs: `journalctl -u deploy.service -f`
3. Check the admin dashboard directly at https://admin.keith.is
