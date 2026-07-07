# @keithk/deploy-mcp

MCP (Model Context Protocol) server for Dial Up Deploy, enabling conversational management of deployed sites through Claude Code.

## Overview

This package provides an MCP server that wraps the Deploy admin API, exposing 6 tools:

1. **list_sites** – List all deployed sites with their status and URLs
2. **get_site_status** – Get detailed information about a specific site
3. **redeploy_site** – Trigger a deployment of a site
4. **get_logs** – Retrieve build or runtime logs for a site
5. **set_custom_domain** – Set or update a custom domain for a site
6. **manage_env_vars** – Get or set environment variables for a site

## Structure

- `src/index.ts` – Main MCP server entry point with tool definitions
- `src/client.ts` – HTTP API client that wraps calls to `/api/sites/*`
- `dist/index.js` – Compiled Bun executable

## Building

```bash
cd packages/mcp
bun run build
```

Or from the root:

```bash
bun run build:mcp
```

Output: `dist/index.js` (352 KB minified)

## Running

```bash
SESSION_TOKEN=your-token API_URL=https://admin.keith.is bun dist/index.js
```

The server connects via stdio and waits for MCP client requests.

## For End Users

See `/docs/MCP_INTEGRATION.md` for:
- How to create a session token
- How to register with Claude Code
- Complete tool reference and examples
- Troubleshooting

## Implementation Notes

- **API Calls:** All communication with the Deploy server goes through the existing `/api/sites/*` HTTP endpoints
- **Authentication:** Single long-lived session token, injected as a query parameter in all API calls
- **Site Resolution:** Site names are resolved to IDs by querying all sites and filtering by name (names are unique)
- **Error Handling:** API errors are caught and returned as tool errors with descriptive messages
- **No Reimplementation:** The MCP server is a thin wrapper; site management logic lives in the core API

## Testing

The server can be tested locally by:

1. Creating a session token:
   ```bash
   bun scripts/create-session-token.ts
   ```

2. Running the server:
   ```bash
   SESSION_TOKEN=<token> bun packages/mcp/dist/index.js
   ```

3. Using an MCP client (e.g., Claude Code) to make tool calls

## Future Enhancements

- Resource access for site-specific operations (e.g., access deployed site files)
- Prompt support for pre-canned site management workflows
- Streaming logs directly instead of fixed-size retrieval
- Multi-user support (with per-user session tokens)
