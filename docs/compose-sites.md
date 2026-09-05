# Compose Sites

A compose site runs a Docker Compose project instead of a single Railpack-built container. Paste the compose file, name the **primary service** and the port it listens on, and Deploy routes the site's traffic to that service.

---

## What Deploy Changes in Your File

The compose file you paste is stored as-is. On every deploy, Deploy writes a rewritten copy to `/var/deploy/sites/<site>/docker-compose.yml`:

- `ports:` are stripped from every service. Nothing publishes on the host except the primary service, which gets one `127.0.0.1:<allocated>:<primary port>` binding for Caddy.
- The site's environment variables are merged into the primary service's `environment:`, with Deploy's values winning. `DATA_DIR=/data` is added when persistent storage is on, and `DATABASE_URL` when a database is attached.
- With persistent storage on, `/var/deploy/data/<site>` is mounted at `/data` on the primary service.

`network_mode: host` and `privileged: true` are rejected.

Images are pulled with `docker compose pull` before `up`. A private registry needs a `docker login` on the server as the `deploy` user first.

---

## Environment Variables for Other Services

Only the primary service receives the merged environment. For the rest, Deploy writes the same variables to `deploy.env` next to the compose file (mode 600). Opt a service in with `env_file`:

```yaml
services:
  web:
    image: ghcr.io/you/app:latest
    ports:
      - "3000:3000"

  worker:
    image: ghcr.io/you/app:latest
    command: ["bun", "run", "worker.ts"]
    env_file:
      - deploy.env
```

Values in `deploy.env` are double-quoted with quotes, backslashes, and newlines escaped, which compose unescapes, so multi-line secrets such as PEM keys come through intact.

---

## Sleep and Wake

Compose sites can sleep like any other site. Sleeping stops the whole project; the first request starts it again.

---

## Related Documentation

- [Databases](databases.md) — Attach a Postgres database and get `DATABASE_URL`
- [Persistent Storage](persistent-storage.md) — The `/data` mount
- [MCP Integration](MCP_INTEGRATION.md) — `create_site` with `source_type=compose`
