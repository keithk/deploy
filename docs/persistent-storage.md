# Persistent Storage

By default, container filesystems are ephemeral—data is lost when you redeploy. Enable persistent storage to keep data across redeploys.

---

## How It Works

When enabled, Deploy:

1. Creates a directory on the host at `/var/deploy/data/{site-name}/`
2. Mounts it into the container at `/data`
3. Sets the `DATA_DIR=/data` environment variable

```
Host: /var/deploy/data/mysite/  ←→  Container: /data
```

Data written to `/data` persists across redeploys, restarts, and container rebuilds.

---

## Enabling Persistent Storage

### Via Dashboard

1. Click on your site
2. Go to **Settings**
3. Toggle **Persistent Storage** on
4. Confirm the redeploy prompt

The site will redeploy with the volume mounted.

---

## Using Storage in Your App

Use the `DATA_DIR` environment variable to find the storage path:

### Node.js

```javascript
const dataDir = process.env.DATA_DIR || './data';
const dbPath = `${dataDir}/database.sqlite`;
```

### Python

```python
import os
data_dir = os.environ.get('DATA_DIR', './data')
db_path = f"{data_dir}/database.sqlite"
```

### Ruby

```ruby
data_dir = ENV['DATA_DIR'] || './data'
db_path = "#{data_dir}/database.sqlite"
```

---

## Good Uses for Persistent Storage

- **SQLite databases** — Application data
- **User uploads** — Files uploaded by users
- **Cache files** — Build caches, computed data
- **Application state** — Session files, local configs

## Avoid Storing

- **Large binary assets** — Use object storage (S3, etc.) instead
- **Logs** — Use the built-in logging, not `/data`
- **Temporary files** — Use `/tmp` in the container

---

## Backups

Data lives on the host filesystem. To backup:

```bash
# Single site
cp -r /var/deploy/data/mysite /backup/mysite-$(date +%Y%m%d)

# All sites
rsync -av /var/deploy/data/ /backup/deploy-data/
```

---

## File Locations

| Location | Description |
|----------|-------------|
| `/var/deploy/data/` | Base directory for all site data (host) |
| `/var/deploy/data/{site}/` | Data directory for a specific site (host) |
| `/data` | Mount point inside containers |

The base path can be customized with the `DEPLOY_DATA_PATH` environment variable.

---

## Troubleshooting

### Container can't write to /data

Check directory permissions on the host:

```bash
ls -la /var/deploy/data/your-site/
```

### Data not persisting

Verify persistent storage is enabled:

```bash
# Check in the database
sqlite3 /home/deploy/deploy/data/deploy.db \
  "SELECT name, persistent_storage FROM sites WHERE name='your-site'"
```

### Finding your data

```bash
# List all site data directories
ls -la /var/deploy/data/

# Check contents of a specific site
ls -la /var/deploy/data/your-site/
```

---

## Related Documentation

- [Configuration](configuration.md) — Environment variables
- [Getting Started](getting-started.md) — Initial setup
