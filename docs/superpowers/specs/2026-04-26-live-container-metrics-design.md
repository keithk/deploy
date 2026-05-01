# Live Container Metrics — Design

Per-container CPU, memory, and network charts built into the admin dashboard.
Data is polled from `docker stats`, stored in SQLite, and served via a new API endpoint.
Rendered with vanilla SVG in a new "Metrics" tab on the site detail page.

## Goals

- See live CPU %, RSS memory, and network rx/tx for a running container
- Scroll back through the last 1h / 6h / 24h / 7d on configurable time windows
- Charts fit visually alongside the existing waterfall and logs tabs (oklch palette, monospace)
- No external dependencies — SQLite only, no Prometheus, no Grafana

## Non-goals

- Per-process breakdown inside a container (just container-level stats)
- Cross-site overlay (each site detail page shows only its own container)
- Alerting / thresholds
- Backfill of metrics before the feature is deployed

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Data source | `docker stats --no-stream --format json` | One sub-process per tick; no daemon; works on all Docker versions |
| Poll interval | 5 s | Matches the "live" feel of Grafana; at 5 s over 7 days we produce ~120 k rows per container, well within SQLite's comfort zone |
| Retention | 7 days | Enough history to diagnose a weekend incident; after that the data has low analytical value |
| Pruning strategy | Inline with poller tick | Same interval, no separate cron; pruning one `DELETE` per tick is cheap (index scan by `recorded_at`) |
| Metrics stored | cpu_pct, mem_bytes, mem_limit_bytes, net_rx_bytes, net_tx_bytes | Everything `docker stats` reports per container natively |
| Chart library | Vanilla SVG (no dependency) | Small dataset, simple shapes; we only need polyline/path area charts. uPlot would add ~40 KB and a build step for a feature that fits in ~200 lines of SVG math |
| Time window controls | 1h / 6h / 24h / 7d buttons | Mirrors common monitoring dashboards; covers the 7-day retention window exactly |
| Polling in UI | Same pattern as `<deploy-site-deploys>` — 5 s interval, stops on `disconnectedCallback` | Consistent cadence; pausing off-screen saves CPU |

## Architecture

Four layers that follow the existing patterns exactly:

```
Migration 009  →  ContainerMetricModel  →  MetricsPoller service  →  GET /api/sites/:id/metrics
                                                                   →  <deploy-site-metrics> web component
```

### 1. Database — migration `009-container-metrics.ts`

```sql
CREATE TABLE container_metrics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id     TEXT    NOT NULL,
  recorded_at TEXT    NOT NULL,  -- ISO-8601
  cpu_pct     REAL    NOT NULL,
  mem_bytes   INTEGER NOT NULL,
  mem_limit_bytes INTEGER NOT NULL,
  net_rx_bytes INTEGER NOT NULL,
  net_tx_bytes INTEGER NOT NULL,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);
CREATE INDEX idx_container_metrics_site_recorded
  ON container_metrics (site_id, recorded_at DESC);
```

Notes:
- `INTEGER PRIMARY KEY AUTOINCREMENT` keeps the row compact (no UUID text overhead on a write-heavy table).
- `mem_limit_bytes` is stored so the UI can compute mem_pct at render time without an extra round-trip.
- Cascade delete means deleting a site cleans up all its metrics automatically.
- The composite index `(site_id, recorded_at DESC)` makes the `since` query a single range scan.

**Retention**: rows older than 7 days are deleted in the same tick as the write:
```sql
DELETE FROM container_metrics
  WHERE recorded_at < datetime('now', '-7 days');
```

### 2. Core model — `packages/core/src/database/models/container-metric.ts`

```ts
interface ContainerMetric {
  id: number;
  site_id: string;
  recorded_at: string;
  cpu_pct: number;
  mem_bytes: number;
  mem_limit_bytes: number;
  net_rx_bytes: number;
  net_tx_bytes: number;
}

class ContainerMetricModel {
  insert(data: Omit<ContainerMetric, 'id'>): void
  findBySite(siteId: string, since: string, limit?: number): ContainerMetric[]
  pruneOld(beforeIso: string): void
}
```

`findBySite` returns rows in `recorded_at ASC` order (oldest first) so chart X-axes map naturally to time.

### 3. Server service — `packages/server/src/services/metrics-poller.ts`

```
MetricsPoller
  start()   — sets up a 5 s interval
  stop()    — clears the interval
  tick()    — one poll + prune cycle (also exported for testing)
```

`tick()` flow:
1. Query `siteModel.findAll()` for sites where `status === 'running'`.
2. For each, run `docker stats --no-stream --format '{{json .}}' deploy-{name}`.
3. Parse JSON: `CPUPerc`, `MemUsage` ("512MiB / 512MiB" format), `NetIO`.
4. Convert to numeric bytes/percent, insert a row via `containerMetricModel.insert(...)`.
5. After all inserts, call `containerMetricModel.pruneOld(sevenDaysAgo)`.
6. Any Docker error for a single container is `error()`-logged and skipped — other containers still record.
7. If Docker is entirely unreachable (all containers fail), log once and return — do not throw.

The poller is started in `createServer.ts` alongside `startSleepMonitor()`.

### 4. API — `packages/server/src/api/metrics.ts`

```
GET /api/sites/:id/metrics?since=<ISO-8601>&limit=<number>
```

- `since` defaults to 1 hour ago.
- `limit` defaults to 720 (1h at 5 s = 720 samples; 7d at 5 s = 120,960 — cap at 4032 to keep response under ~1 MB).
- Requires authentication (same `requireAuth` guard as other site endpoints).
- Returns `{ site_id, samples: ContainerMetric[] }`.

Registered in `handleDeploymentsApi` routing style — a new `handleMetricsApi` function imported into `handlers.ts`.

### 5. Admin UI — `packages/admin/src/components/site-metrics.ts`

New `<deploy-site-metrics site-id="...">` web component. Added to site-detail.ts as a new "Metrics" tab (not the default tab).

**Layout**: three stacked chart panels, each 120 px tall:
- **CPU %** — area chart, y-axis 0–100.
- **Memory** — area chart, y-axis 0–`max(mem_limit_bytes)`. Labels in MiB.
- **Network** — two-line chart (rx green, tx pink/accent), y-axis in KiB/s (delta per 5 s, divided by 5).

**Time window**: four buttons at the top (`1h` / `6h` / `24h` / `7d`). Selecting a window re-fetches with the matching `since` param. Default is `1h`.

**Polling**: 5 s `setInterval` when mounted, cleared in `disconnectedCallback`. This matches `<deploy-site-deploys>` exactly.

**Empty state**: if site is not running, show "No metrics — container is not running." If running but no data yet (< 5 s after poller start), show a spinner.

**SVG approach**: one `<svg>` per panel. A `polyline` for line charts; a `<path>` with a closed bottom for area fills. X-axis: time labels at left/right ends. Y-axis: min/max labels. No external DOM library — all math in ~60 lines per chart function.

**Color palette** (matches existing CSS custom properties):
- CPU: `var(--step-build)` — amber oklch(78% 0.15 88)
- Memory: `var(--step-start)` — green oklch(72% 0.14 145)
- Network rx: `var(--state-running)` — green
- Network tx: `var(--accent)` — magenta

### `site-detail.ts` changes

The active tab union type gains `"metrics"`. The tab bar renders a new "Metrics" button. `renderTabContent()` adds a `metrics` case that returns `<deploy-site-metrics site-id="...">`. No other tabs are modified.

## Data volume estimate

At 5 s intervals, 7-day retention, one container:
- 7 × 24 × 3600 / 5 = **120,960 rows**
- Each row: ~80 bytes (3 TEXT + 5 INTEGER/REAL) → ~9.7 MB per container
- Keith currently has a small number of sites; total footprint is negligible

## Test plan

| Layer | File | What it covers |
|---|---|---|
| Model | `packages/core/src/database/models/container-metric.test.ts` | insert, findBySite ordering, pruneOld, cascade delete |
| Poller | `packages/server/src/services/metrics-poller.test.ts` | tick() writes rows, skips on Docker error, prunes old rows |
| API | `packages/server/tests/metrics-api.test.ts` | GET returns 200 with samples, requires auth, respects `since` |

Model tests use the same pattern as `deployment-step.test.ts`: fresh tmp DB per test, reset singleton, run migrations.

Poller tests mock `docker stats` via `mock.module()` on the container service, same pattern as `deploy-steps.test.ts`.
