# Dev Mode Port Handling Improvements

## Changes Made

### 1. Enhanced Process Manager (`packages/server/src/utils/process-manager.ts`)

#### Automatic Port Argument Passing
- Added framework detection to automatically pass `--port` arguments to dev scripts
- Supports multiple frameworks:
  - **Waku**: `--port`
  - **Vite/Nuxt**: `--port` 
  - **Next.js**: `-p`
  - **Remix**: `--port`
  - **Astro**: `--port`
  - **Eleventy/11ty**: `--port`
  - **webpack-dev-server**: `--port`

#### Port Conflict Resolution
- Added `findAvailablePort()` method to find alternative ports when conflicts occur
- In dev mode with static-build sites, automatically searches for available ports (up to 20 attempts)
- Logs port reassignments clearly
- Uses the assigned port consistently throughout the process lifecycle

#### Enhanced Logging
- Added debug logging for working directory and environment variables
- Better error messages showing actual ports used
- Clear indication when dev mode port flags are being passed

### 2. Updated Proxy Utils (`packages/server/src/utils/proxy.ts`)

- Added `MODE: "dev"` environment variable when starting dev servers
- This enables the port conflict resolution logic in the process manager

### 3. Improved CLI Messages (`packages/cli/src/commands/server.ts`)

- Enhanced dev mode startup messages
- Clearer explanation of how to access sites
- Shows both Caddy (HTTPS) and direct (HTTP) access methods

## How It Works Now

### Before (Problems):
1. Sites with `"dev": "waku dev"` would default to port 3000
2. Multiple sites would conflict on the same port
3. No automatic port passing to dev commands
4. Users had to manually add `--port` flags to each site

### After (Solutions):
1. **Automatic Port Detection**: Process manager detects when a script needs port configuration
2. **Framework-Aware Port Flags**: Uses the correct port flag for each framework (e.g., `-p` for Next.js, `--port` for others)
3. **Port Conflict Resolution**: Automatically finds available ports when conflicts occur
4. **Better Logging**: Clear indication of what ports are being used and why

## Example Output

```bash
# Before
Starting process for trip-planner on port 3898 with command: bun run dev

# After  
Port 3898 is in use, searching for available port...
Using alternative port 3899 for trip-planner (original port 3898 was in use)
Dev mode: passing port 3899 to dev script with flag --port
Starting process for trip-planner on port 3899 with command: bun run dev -- --port 3899
```

## Accessing Your Sites

With these improvements, your sites should be accessible at:

1. **Main dev server**: `http://localhost:3000`
2. **Individual sites**: 
   - Via routing: `http://trip-planner.localhost:3000`
   - Direct access: `http://localhost:3899` (the actual dev server port)

## Troubleshooting

If you're still getting "Unable to connect" errors:

1. Check the logs: `deploy processes logs trip-planner 3899`
2. Verify the process is healthy: `deploy processes list`
3. Test direct access: `curl http://localhost:3899`
4. Check if the main server is routing correctly: `curl -H "Host: trip-planner.localhost" http://localhost:3000`

## Next Steps

The routing issue you're experiencing might be due to:
1. The subdomain routing not being properly configured
2. The site not being in the main server's site discovery
3. The proxy/routing logic needing updates

To debug this, we should check how the main server discovers and routes to your trip-planner site.