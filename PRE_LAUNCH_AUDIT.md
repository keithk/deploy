# Dial Up Deploy — Pre-Launch Audit & Base-Status Plan

Generated 2026-06-25 after a full-codebase audit by four specialist agents.

## Audit scope

- **CLI/Tooling**: `package.json`, `tsconfig.json`, `biome.json`, `scripts/`, `packages/cli/`, `packages/actions/`
- **Deployment structure**: `packages/server/src/services/`, `config/`, `data/`, `sites/`, `.deploy/`
- **Container/Infrastructure**: systemd, setup scripts, `.env`, SSL keys, Docker readiness
- **Docs alignment**: `README.md`, `docs/`, `CLAUDE.md`, inline comments, CLI help text

---

## Executive summary

| Severity | Count |
|----------|-------|
| Critical | 6 |
| High     | 12 |
| Medium   | 16 |
| Low      | 5 |
| **Total**| **39** |

**Bottom line**: The core deploy/proxy loop works for Keith's single-operator setup, but there are several security, portability, and documentation issues that will break the first time someone else tries to install or use the platform. The critical items should be fixed before showing the project publicly.

---

## Critical blockers — fix before opening to anyone

### 1. `cleanupContainers` prunes *every* stopped Docker container on the host
- **File**: `packages/server/src/services/container.ts:386`
- **Why it matters**: On a shared Docker host this deletes unrelated customer workloads.
- **Fix**: Filter to project-owned containers (`--filter "name=deploy-*"` or a project label) and add an integration test proving unrelated containers survive.

### 2. Site secrets and GitHub tokens are stored plaintext in SQLite
- **Files**: `packages/core/src/database/schema.ts:19`, `packages/core/src/database/models/site.ts:73-101`, `packages/server/src/services/container.ts:161-166`
- **Why it matters**: Anyone with filesystem access to `data/dialup-deploy.db` can read every user secret. The schema comment even says "JSON, encrypted" while the code does no encryption.
- **Fix**: Encrypt `env_vars` at rest with a `DEPLOY_ENCRYPTION_KEY`, and stop passing secrets via `docker run -e` (use `--env-file` or Docker secrets).

### 3. Proxy injects `Access-Control-Allow-Origin: *` on every response
- **File**: `packages/server/src/utils/proxy.ts:207`
- **Why it matters**: Every site becomes readable from any origin, undermining private sites and tenant isolation.
- **Fix**: Remove the blanket header injection. Let sites set their own CORS.

### 4. SSH-based authentication is documented but does not exist
- **Docs**: `README.md:83-103`, `docs/getting-started.md:98-119`, `docs/configuration.md:106`
- **Code**: `packages/cli/src/commands/setup.ts:109-162` (collects password, no SSH); `packages/server/src/api/auth.ts:24-85` (password + argon2id + cookie)
- **Why it matters**: New users will follow the README first step and it will fail.
- **Fix**: Rewrite all auth docs to describe the existing password-based dashboard login at `https://admin.<domain>`.

### 5. Development TLS private keys are committed to git
- **Files**: `config/ssl/dev.deploy.key`, `config/ssl/dev.flexi.key`
- **Why it matters**: Clone = leaked private key material. Yes they are local-only certificates, but it breaks secret hygiene.
- **Fix**: Rotate, remove from git history, add `config/ssl/*.key` to `.gitignore`, and generate local certs during setup.

### 6. Committed Caddyfile contains hardcoded operator paths and domain
- **Files**: `config/Caddyfile:4`, `.deploy/caddy/Caddyfile:4-5`
- **Why it matters**: Caddy will fail on any other machine because storage points to `/Users/keith/projects/deploy/...`.
- **Fix**: Do not commit a machine-specific Caddyfile. Commit a generic `Caddyfile.example` and have `deploy setup` generate the real file per environment.

---

## High-priority gaps

### 7. `ROOT_DIR` vs `SITES_DIR` confusion breaks site discovery
- **Files**: `packages/cli/src/commands/setup.ts:192`, `packages/cli/src/index.ts:10`, `packages/cli/src/utils/site-manager.ts:14`, `packages/server/src/services/git.ts`, `packages/server/src/services/compose.ts`, `package.json:13`, `config/deploy.service:14-15`, `.env.example:4`
- **Problem**: Setup writes `SITES_DIR`, but the CLI and root start script override with `ROOT_DIR=$(pwd)/sites`. Production will clone sites into the project directory instead of `/var/deploy/sites`.
- **Fix**: Pick one variable, use it everywhere, and make `deploy.service`/`.env.example` consistent.

### 8. `scripts/setup.sh` does not install the systemd units it tells users to start
- **Files**: `scripts/setup.sh:207-217`, `config/deploy.service`, `scripts/update.sh:21`
- **Problem**: The script prints `sudo systemctl start deploy` but never copies/installs/enables `deploy.service` or Caddy's service. `update.sh` also assumes Caddy is enabled even though `setup.sh` disables it.
- **Fix**: Install and enable both `deploy.service` and the chosen Caddy unit in `setup.sh`, use absolute `bun` paths, and make `update.sh` verify units before restarting.

### 9. `deploy.service` is missing writable paths and environment variables
- **Files**: `config/deploy.service:22-30`, `packages/server/src/utils/process-manager.ts:141-148`
- **Problem**: Process logs go to `<cwd>/logs`, which `ProtectHome=read-only` blocks. Many required env vars are not set.
- **Fix**: Add `/home/deploy/deploy/logs` to `ReadWritePaths`, load `.env` explicitly, and include all runtime env vars.

### 10. Production systemd `ExecStart` points at TypeScript source
- **Doc**: `docs/DEPLOYMENT.md:98`
- **Reality**: Production entry point is `packages/cli/dist/index.js`; docs say to run `packages/cli/src/index.ts start --foreground`.
- **Fix**: Update the doc to `/usr/local/bin/bun packages/cli/dist/index.js start --foreground`.

### 11. Action documentation uses the wrong package name and directory
- **Docs**: `docs/actions/types/*.md` (many files)
- **Reality**: Package is `@keithk/deploy-actions`, action directory is `.deploy/actions`.
- **Fix**: Global replace `@dialup-deploy/actions` → `@keithk/deploy-actions` and `.dialup/actions` → `.deploy/actions`.

### 12. `defineWebhookAction` is documented but not exported
- **Docs**: `docs/actions/types/webhook-actions.md`, `docs/actions/types/custom-actions.md`
- **Reality**: Only `defineAction({ type: "webhook", ... })` works.
- **Fix**: Either add `defineWebhookAction` to `@keithk/deploy-actions` or rewrite the docs.

### 13. Route-action options (`auth`, `cors`, `cache`, `rateLimit`) are documented but not implemented
- **Docs**: `docs/actions/types/route-actions.md:49-52`
- **Reality**: `ActionRoute` type only has `path`, `method`, `handler`, `middleware`.
- **Fix**: Implement the options or remove them from docs.

### 14. Custom domains are not supported for DB-backed sites
- **Files**: `packages/server/src/createServer.ts:328-380`, `docs/custom-domains.md:29-39`
- **Problem**: `sites` table has no `custom_domain` column; custom domains only exist in filesystem `SiteConfig`.
- **Fix**: Add `custom_domain` column, validate DNS/ownership, and route custom-domain requests. Update docs to make manual Caddyfile workflow primary until UI exists.

### 15. On-demand TLS validation URL is hardcoded to `localhost:3000`
- **File**: `packages/core/src/utils/caddyfile.ts:35-36`, `:139`
- **Problem**: If `PORT` is not 3000, certificate issuance fails because Caddy cannot reach the validator.
- **Fix**: Use the configured `port` when building the `ask` URL.

### 16. Container health checks accept any non-5xx response on `/`
- **File**: `packages/server/src/services/container.ts:342-371`
- **Problem**: A 404/401 at root is treated as healthy, leading to false-positive deploys and rollbacks.
- **Fix**: Support a `HEALTHCHECK_PATH` env var and require a 2xx response; default to `/` only when unset.

### 17. Server boot recovery does not restart Compose sites
- **File**: `packages/server/src/createServer.ts:436-468`
- **Problem**: Reboot recovery looks for containers named `deploy-${site.name}`, but Compose containers are named `deploy-${site.name}-{service}-1`, so they are never restarted.
- **Fix**: Use `startSiteContainer`/`services/site-ops.ts` during recovery so the restart path respects site type.

### 18. Bun and Railpack are installed without version pinning or checksums
- **File**: `scripts/setup.sh:60`, `:120`
- **Problem**: Piped remote install scripts with no version pin, checksum, or retry logic.
- **Fix**: Pin versions and verify checksums/signatures.

---

## Medium-priority findings

### CLI/Tooling
- `packages/cli/src/index.ts:17-18` spells product name "DailUpDeploy" instead of "DialUpDeploy".
- `packages/cli/README.md:31-58` documents disabled/renamed commands (`init`, `site`, `processes`, `build`, `run`, `action run` vs `actions run`).
- `deploy actions create --type custom` is advertised but unsupported (`packages/cli/src/commands/actions.ts:164`).
- Leftover `flexiweb` branding in generated service files (`packages/cli/src/utils/setup-utils.ts:528-572`).
- Orphaned legacy setup scripts `packages/cli/src/scripts/setup.ts` and `setup-production.ts` duplicate logic and use `flexiweb`.
- CLI imports server internals directly (`packages/cli/src/commands/server.ts:22`).
- `require()` used inside ESM modules (`packages/cli/src/commands/processes.ts:381`, `cli-helpers.ts:154`).
- Local build helpers only support generic `npm run build`; Astro/Next.js/custom TS paths are not handled (`packages/cli/src/utils/build-utils.ts:16-95`).

### Deployment/Data
- `DeploymentModel.markStaleAsFailed()` exists but is never called on startup (`packages/core/src/database/models/deployment.ts:212-222`).
- Metrics/logs retention is unbounded and will grow the SQLite database (`packages/server/src/services/metrics-poller.ts:8-9`, `packages/core/src/database/models/log.ts:102-126`).
- Proxy overwrites `Host` header with `localhost:${targetPort}` (`packages/server/src/utils/proxy.ts:184`).
- Proxy buffers entire request bodies into memory with no size limit (`packages/server/src/utils/proxy.ts:188-191`, `Bun.serve` has no `maxRequestSize`).
- Container resource limits are hardcoded (`--memory=512m --cpus=1`) with no per-site override and no isolated network (`packages/server/src/services/container.ts:196-197`).

### Infrastructure
- No `Dockerfile`, `docker-compose.yml`, or `.dockerignore` for the Deploy platform itself, despite README mentioning Docker.
- Caddy access log writes to `/var/log/caddy/access.log` without rotation (`packages/core/src/utils/caddyfile.ts:41-43`).
- Local CA private keys live inside the project dir with no backup guidance (`config/caddy-data/pki/authorities/local/root.key`).
- `.env.example` only documents 3 variables while the code reads many more.

### Documentation
- `docs/persistent-storage.md:121` references wrong database filename (`deploy.db` vs `dialup-deploy.db`).
- `railpack.json` customization is documented but the platform layer never reads it (`packages/server/src/services/railpacks.ts:42-96`).
- Underscore-site behavior is partially accurate but misleading (`docs/extras.md:60-65`).
- `docs/DEPLOYMENT.md:42` uses plural "Railpacks".
- `buildSite` example in scheduled-actions doc only works for `static-build` sites.
- Site visibility feature is implemented but not explained.
- GitHub webhook URL format is undocumented (`/webhook/github` on admin subdomain).

---

## Low-priority findings
- `bun.lock:6` has stale root workspace name `keith-is-host` (root `package.json` uses `deploy`).
- Hardcoded dev Caddy configs in `.deploy/caddy/Caddyfile` are development artifacts.

---

## Base-status checklist

Use this as the definition of "ready to show people":

- [ ] No committed TLS private keys or hardcoded operator paths in Caddy configs.
- [ ] `cleanupContainers` filters to project-owned containers only.
- [ ] Secrets encrypted at rest; not passed on `docker run -e` command lines.
- [ ] Proxy no longer injects blanket `Access-Control-Allow-Origin: *`.
- [ ] Authentication docs describe the password-based dashboard login that actually exists.
- [ ] `ROOT_DIR`/`SITES_DIR` naming is unified and used consistently by CLI, server, and systemd.
- [ ] `scripts/setup.sh` installs and enables both `deploy.service` and the Caddy unit.
- [ ] `docs/DEPLOYMENT.md` references the built `packages/cli/dist/index.js` path, not `.ts` source.
- [ ] `.env.example` lists every runtime variable and explains defaults.
- [ ] Action docs use `@keithk/deploy-actions` and `.deploy/actions` everywhere.
- [ ] Route-action and webhook docs match the actual exported API.
- [ ] On-demand TLS validation URL respects the configured `PORT`.
- [ ] Health checks require a 2xx response or an explicit endpoint.
- [ ] Server boot recovery restarts Compose projects correctly.
- [ ] Bun/Railpack versions are pinned in `setup.sh`.

---

## Recommended next steps

1. **Close the critical security/portability blockers first** (items 1–6 above). They are small, well-scoped changes with outsized impact.
2. **Resolve the `ROOT_DIR`/`SITES_DIR` + systemd setup story** (items 7–10). This unblocks a repeatable production install.
3. **Audit-pass the documentation** against the now-fixed implementation, starting with auth, actions, and `.env.example`.
4. **Run the full CLI through a fresh install on a throwaway VM** to shake out any remaining setup-script issues.
5. **After the checklist is green**, the project is at "base status" and new functionality can begin.
