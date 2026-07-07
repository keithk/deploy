# Deploy Waterfall — Design

A per-deploy timing breakdown that shows where each deploy spent its time.
Renders live during an in-progress deploy and stays as a static record after.
Lives on a new "Deploys" tab on the site detail page.

## Goals

- See at a glance which phase of a deploy is slow (clone vs. build vs. health check, etc.)
- Watch a live deploy progress through its phases without leaving the admin
- Diagnose failed deploys by seeing which step failed and the error message tied to it

## Non-goals

- Sub-step instrumentation inside Railpack/Docker output (revisit later if a phase is consistently the long pole)
- Cross-site comparison views (the existing `/deployments` list already serves that role)
- Backfilling step timings for deploys that already happened — legacy rows render with total duration only

## Decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Live or historical? | Both — same component handles in-progress and completed |
| Granularity | 6 top-level steps only |
| Location | New "Deploys" tab on site detail page |
| Visualization | Hybrid: stacked-segment bar + expandable per-step rows |
| Persistence | New `deployment_steps` table |

## Architecture

Three layers:

1. **Database** — new `deployment_steps` table; `DeploymentStepModel` for CRUD.
2. **Server** — `deploy.ts` instruments each phase by calling `startStep`/`completeStep`. The deployments API returns steps inline so the UI fetches once.
3. **Admin UI** — new `<deploy-site-deploys>` web component owns the tab; polls when active deploys exist.

The deployment-level `status` field on the `deployments` table stays untouched. It still drives the existing badge on the cross-site `/deployments` page. Steps are an additive layer for timing detail.

## Data model

### Migration `008-deployment-steps.ts`

```sql
CREATE TABLE deployment_steps (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT,
  FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
);
CREATE INDEX idx_deployment_steps_deployment_id ON deployment_steps(deployment_id);
```

Cascade delete on the FK means pruning a deployment cleans its steps automatically.

### Step names (the v1 set)

Note on naming: the existing `deployment.status` enum has a value `healthy` which means "the new container has passed its health checks." The new step name `health_check` means "we are running health checks." These coexist intentionally — `status` describes the deployment's current phase; `step.name` describes the work item being timed. Don't try to unify them.



| Name | Wraps | Always present? |
|---|---|---|
| `clone` | `cloneSite()` (git clone or pull) | Yes |
| `build` | `buildWithRailpacks()` | Yes |
| `start` | `startContainer()` | Yes |
| `health_check` | `waitForContainerHealth()` | Yes |
| `switch` | `completeBlueGreenDeployment()` | Only on redeploy (when an old container exists) |
| `register_actions` | `discoverSiteActions()` + per-action `actionModel.upsert` loop | Yes |

### `status` values

- `running` — `started_at` set, `completed_at` null. The active step.
- `completed` — both timestamps set, `error_message` null.
- `failed` — both timestamps set, `error_message` populated.

### `DeploymentStepModel`

```ts
class DeploymentStepModel {
  startStep(deploymentId: string, name: string): DeploymentStep
  completeStep(stepId: string, errorMessage?: string): void
  findByDeploymentId(deploymentId: string): DeploymentStep[]   // ordered by started_at ASC
  findManyByDeploymentIds(ids: string[]): Map<string, DeploymentStep[]>  // batch fetch for list views
}
```

`completeStep` sets `completed_at = now`. If `errorMessage` is provided, status becomes `failed`; otherwise `completed`.

`findManyByDeploymentIds` exists so the list endpoint can fetch steps for N deployments in one query rather than N+1.

## Server changes

### Instrumentation in `packages/server/src/services/deploy.ts`

Wrap each phase with `startStep` / `completeStep`. Existing `deploymentModel.updateStatus(...)` calls stay — they drive the deployment-level status badge. We track a `currentStepId` so the catch block can mark the right step as failed.

```ts
let currentStepId: string | null = null;

try {
  // ...existing setup...

  currentStepId = deploymentStepModel.startStep(deployment.id, "clone").id;
  deploymentModel.updateStatus(deployment.id, "cloning");
  const sitePath = await cloneSite(site.git_url, site.name, site.branch);
  deploymentStepModel.completeStep(currentStepId);

  currentStepId = deploymentStepModel.startStep(deployment.id, "build").id;
  deploymentModel.updateStatus(deployment.id, "building");
  const buildResult = await buildWithRailpacks(sitePath, site.name);
  if (!buildResult.success) throw new Error(buildResult.error || "Build failed");
  deploymentStepModel.completeStep(currentStepId);

  // ...same pattern for start, health_check, (conditionally) switch, register_actions...
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (currentStepId) {
    deploymentStepModel.completeStep(currentStepId, message);
  }
  // ...existing failure handling...
}
```

The `switch` step is only opened/closed inside the existing `if (containerInfo.isBlueGreen)` block.

The `health_check` step is the special one: when the health check fails, the existing code does extra work (capturing container logs, rolling back). We complete the `health_check` step with `errorMessage = "Container failed health check"` *before* that recovery work, so the waterfall reflects where time was actually spent.

### API changes

Modify `packages/server/src/api/deployments.ts`:

- `GET /api/deployments/:id` — include `steps: DeploymentStep[]` in the response
- `GET /api/sites/:id/deployments` — include `steps` on each deploy (use `findManyByDeploymentIds`)
- `GET /api/deployments` and `/api/deployments/active` — leave alone; the cross-site list doesn't need step detail

Steps are sorted by `started_at` ASC so the UI renders them in execution order.

## Admin UI

### New component: `packages/admin/src/components/site-deploys.ts`

Custom element `<deploy-site-deploys>` with attribute `site-id`.

**Lifecycle:**
- `connectedCallback`: fetch `/api/sites/:id/deployments?limit=20`, render
- Poll every 3 seconds while any deployment in the list is non-terminal (`status NOT IN ('completed', 'failed', 'rolled_back')`); stop polling when all are terminal — saves CPU when looking at history
- Re-fetch on `disconnectedCallback` cleanup of the interval

**Card layout for each deployment** (newest first):

```
┌─────────────────────────────────────────────────────────────┐
│ [running ●] 4m 12s · a3f9c2d "fix typo" · 4/26 14:23      ▾│
│ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   ← stacked-segment bar
│   [1.04s]  clone           ✓                                │
│   [42.1s]  build           ✓                                │
│   [2.31s]  start           ✓                                │
│   [12.4s]  health_check    ⏵ running…                       │
└─────────────────────────────────────────────────────────────┘
```

**Header row:** status badge, total duration, commit sha (7 chars, hover shows full message), absolute timestamp via `toLocaleString()`, expand/collapse caret.

Reuse the `formatDuration(startedAt, completedAt)` helper from `deployments.ts` for total duration; for individual step durations use a tighter formatter (`0.34s`, `12.4s`, `2m 03s`) since the step rows benefit from sub-second precision.

**Stacked-segment bar:** full-width div with one inline-block child per step. For *completed* deploys, segment width = `(step.duration / totalDuration) * 100%` (the bar fills the row). For *in-progress* deploys, the bar isn't filled to 100% — completed segments size to their share of `MAX(deploymentRowWidth, currentElapsedTotal)` against the elapsed total, and the running step's segment grows on each 3s poll. This keeps the relative scale honest while a deploy runs and produces a clean fill at completion.

Color per step name (drawn from existing CSS vars where possible):

| Step | Color |
|---|---|
| `clone` | `--accent` (#e91e8c — the signature pink) |
| `build` | `--status-building` (#f59e0b) |
| `start` | `--status-running` (#22c55e) |
| `health_check` | a teal — new var `--step-health` |
| `switch` | a violet — new var `--step-switch` |
| `register_actions` | a slate — new var `--step-register` |

The currently-running step renders as an animated striped segment whose width grows with elapsed time; future steps are invisible (the bar is partial). Failed steps render with a red diagonal stripe overlay.

**Expanded rows:** monospace, right-aligned duration column for visual rhythm. Status icon: `✓` completed, `✗` failed (in red, with error message inline), `⏵` running (with elapsed seconds). Color of step name matches the segment color.

**Default expansion:**
- Active deploys → expanded
- Failed / rolled_back → expanded
- Completed → collapsed (click caret to expand)

**Empty state:** "No deployments yet. Click Redeploy to deploy this site."

### Integration in `site-detail.ts`

- Extend `activeTab` union to include `'deploys'`
- Add tab button "Deploys" as the first tab (it's the most useful default for a deployed site)
- Update query-param parsing to recognize `?tab=deploys`
- When `activeTab === 'deploys'`, render `<deploy-site-deploys site-id="${this.siteId}">`

## Error handling & edge cases

| Case | Behavior |
|---|---|
| Legacy deploys (no step rows) | Card shows total duration only; bar replaced with a thin neutral track and the text "step timing not recorded"; expanded section hidden |
| In-progress with no completed steps | Empty bar; expanded list shows running step with elapsed seconds ticking forward (driven by the 3s poll, not setInterval per row) |
| Failed deploy | Step that failed renders red with `error_message` inline; later steps absent (they never started) |
| Rolled-back deploy | Same as failed, plus a "rolled back to previous version" note in the header |
| Process crashed mid-deploy | A step has `started_at` but no `completed_at` while deployment is terminal. UI: any non-completed step on a terminal deployment renders as failed with `error_message` falling back to "deploy interrupted" |
| Sub-second steps | Duration formatted as `0.Xs` not `0s`. Bar segments below ~3px wide get a `min-width: 3px` so they remain visible/hoverable |
| Skipped `switch` step on first deploy | No row created; nothing in the waterfall — this is correct, not a bug |

## Testing

**`packages/core/src/database/models/deployment-step.test.ts`** (new):
- `startStep` creates a row with `running` status and `started_at = now`
- `completeStep` without error sets `completed_at` and status `completed`
- `completeStep` with error sets status `failed` and `error_message`
- `findByDeploymentId` returns steps ordered by `started_at` ASC
- `findManyByDeploymentIds` batches correctly and returns a `Map`
- Cascade delete: deleting a deployment removes its steps

**`packages/server/src/services/__tests__/deploy.test.ts`** (extend existing if present, otherwise create):
- Mock `cloneSite`, `buildWithRailpacks`, `startContainer`, `waitForContainerHealth`, `discoverSiteActions`
- Run `deploySite`; assert step rows exist for `clone`, `build`, `start`, `health_check`, `register_actions` in that order, all `completed`
- For a redeploy path (existing container), assert `switch` row also exists between `health_check` and `register_actions`
- For a build failure: assert the `build` step is `failed` with `error_message` populated; later steps absent
- For a health-check failure: assert the `health_check` step is `failed`; `switch`/`register_actions` absent

**API:**
- `GET /api/sites/:id/deployments` returns deployments with `steps` arrays
- `GET /api/deployments/:id` returns the deployment with `steps`

**Component:** the admin package currently has no component tests. Don't introduce a new testing scaffold for v1 — rely on manual verification in the browser (open a site detail page, trigger a redeploy, watch the bar fill in). If we later decide we want component tests, that's its own project.

## Migration & rollout

1. Add migration `008-deployment-steps.ts` — creates table on the next service start.
2. Ship instrumentation in `deploy.ts` — new deploys record steps; old deploys remain step-less.
3. Ship the UI — handles both cases via the legacy-deploy path.
4. No data backfill; no flag-flipping; safe to deploy in one PR.

## Open questions

None blocking — all design decisions are made.

## Out of scope (mentioned earlier, captured here so future-Keith doesn't re-debate)

- **Sub-step instrumentation** (e.g., parsing Railpack output for analyze/build/tag phases). Revisit only if `build` is consistently the long pole and the cause is non-obvious.
- **Live container metrics dashboard** (CPU/RSS/network charts) — separate workstream, separate agent.
- **Caddy traffic dashboard** (req/s, status codes, latency percentiles) — separate workstream.
