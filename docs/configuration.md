# Configuration

Deploy is designed to work with zero configuration. Railpack auto-detects your language, framework, and build commands from your project files.

For most projects, you don't need any configuration at all.

---

## When You Need Configuration

In some cases, you may want to customize how Railpack builds or runs your project:

- Non-standard start commands
- Custom build steps
- Environment-specific settings
- Projects that Railpack doesn't auto-detect correctly

---

## railpack.json

Add a `railpack.json` file to your project root to customize the build:

```json
{
  "$schema": "https://schema.railpack.com",
  "deploy": {
    "startCommand": "bun run start"
  }
}
```

### Common Options

#### Custom Start Command

```json
{
  "$schema": "https://schema.railpack.com",
  "deploy": {
    "startCommand": "node server.js"
  }
}
```

#### Custom Build Command

```json
{
  "$schema": "https://schema.railpack.com",
  "build": {
    "command": "npm run build:production"
  }
}
```

#### Static Site with Custom Output Directory

```json
{
  "$schema": "https://schema.railpack.com",
  "deploy": {
    "startCommand": "npx serve dist -l $PORT"
  }
}
```

### Full Reference

See the [Railpack documentation](https://railpack.dev/docs) for all available options.

---

## Environment Variables

Set environment variables per-site via the dashboard:

1. Click on a site
2. Go to the **Environment** tab
3. Add your variables

Environment variables are injected into the container at runtime. Common uses:

- `DATABASE_URL` — Database connection string
- `API_KEY` — Third-party service keys
- `NODE_ENV` — Usually set to `production` automatically

### Special Variables

Deploy sets these automatically:

| Variable | Description |
|----------|-------------|
| `PORT` | The port your app should listen on |
| `DATA_DIR` | Path to persistent storage (if enabled) |

---

## Server Configuration

Server-level settings are configured during setup and stored in `.env`:

```bash
PROJECT_DOMAIN=yourdomain.com
PORT=3000
SSH_PORT=2222
SITES_DIR=/var/deploy/sites
NODE_ENV=production
```

To change these, edit `.env` and restart the server:

```bash
sudo systemctl restart deploy
```

---

## Related Documentation

- [Getting Started](getting-started.md) — Initial setup
- [Persistent Storage](persistent-storage.md) — Using the DATA_DIR
- [Railpack Documentation](https://railpack.dev/docs) — Full build configuration
