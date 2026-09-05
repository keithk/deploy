# Databases

Sites can get their own Postgres database with one click. Deploy provisions it on a Postgres server you register once, then injects `DATABASE_URL` into the site the same way it injects `PORT` and `DATA_DIR`.

---

## How It Works

```
Settings → Database Server: postgres://admin:...@db.example.com:5432/defaultdb?sslmode=require
                                            ↓
Site → Settings → Attach database
    creates role  site_myapp  with a random password
    creates database  site_myapp  owned by that role
    stores  DATABASE_URL=postgres://site_myapp:...@db.example.com:5432/site_myapp?sslmode=require
                                            ↓
Next deploy: the container (or the primary compose service) sees DATABASE_URL
```

Each site gets a database and role named `site_<name>` (non-alphanumeric characters become `_`). The role can only log into its own database. The connection string reuses the registered server's host, port, and query string, so `sslmode=require` carries over.

Deploy does not run a Postgres of its own. Any server whose admin role has `CREATEDB` and `CREATEROLE` works: a managed database from your cloud provider, or a container you run yourself.

---

## Registering a Database Server

### Via Dashboard

1. Open **Settings**
2. Under **Database Server**, paste the admin connection string
3. Click **Save**

The connection string is encrypted at rest with `DEPLOY_ENCRYPTION_KEY`. The dashboard only ever shows the host and port.

### Via API

```bash
curl -X PUT https://admin.yourdomain.com/api/settings \
  -H "Content-Type: application/json" \
  -b "session=$TOKEN" \
  -d '{"database_url": "postgres://admin:password@db.example.com:5432/defaultdb?sslmode=require"}'
```

Send an empty string to clear it. Sites that already have a database keep their `DATABASE_URL`; only new attaches need the server.

### Managed databases

Most managed Postgres services put the database on a private network and start with an empty allow-list. Make sure the Deploy server's private IP is allowed, and prefer the private hostname over a public one so traffic never leaves the provider's network.

Check the plan's connection limit. Every attached site's connection pool draws from the same total, so set pool sizes in each app deliberately.

---

## Attaching a Database to a Site

### Via Dashboard

1. Open the site, go to **Settings**
2. Under **Database**, click **Attach database**
3. Redeploy

The Environment tab lists `DATABASE_URL` under system variables once attached.

### Via API

```bash
# Attach (or rotate the password of an existing database)
curl -X POST https://admin.yourdomain.com/api/sites/$SITE_ID/database -b "session=$TOKEN"

# Detach: stop injecting DATABASE_URL, keep the data
curl -X DELETE https://admin.yourdomain.com/api/sites/$SITE_ID/database -b "session=$TOKEN"

# Drop: delete the database, its role, and all data
curl -X DELETE "https://admin.yourdomain.com/api/sites/$SITE_ID/database?drop=true" -b "session=$TOKEN"
```

### Via MCP

> "Attach a database to the blog site"
> "Drop the database on the staging site"

---

## Using the Database in Your App

Read `DATABASE_URL` from the environment. Nothing else is required.

```javascript
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { max: 5 });
```

For compose sites, `DATABASE_URL` lands on the primary service. Pass it through to other services in your compose file if they need it.

---

## Detach, Rotate, Drop

- **Detach** removes `DATABASE_URL` from the site on its next deploy. The database and its data stay put. Attaching again reuses them with a fresh password.
- **Rotate password** is the same operation as attach on an already-attached site: new password, same data, takes effect on the next deploy.
- **Drop** terminates open connections, then deletes the database and role. There is no undo, so take a backup first if you care about the data.

Deleting a site does not drop its database. Drop it first if you want the data gone.

---

## Related Documentation

- [Persistent Storage](persistent-storage.md) — Files that survive redeploys
- [Configuration](configuration.md) — Server configuration
- [MCP Integration](MCP_INTEGRATION.md) — Managing sites conversationally
