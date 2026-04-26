// ABOUTME: Per-site deploy waterfall — shows each deployment as a stacked-segment bar
// ABOUTME: with expandable per-step rows. Polls while any deployment is in-progress.

type StepStatus = "running" | "completed" | "failed";

type StepName =
  | "clone"
  | "build"
  | "start"
  | "health_check"
  | "switch"
  | "register_actions";

interface DeploymentStep {
  id: string;
  deployment_id: string;
  name: StepName;
  status: StepStatus;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

type DeploymentStatus =
  | "pending"
  | "cloning"
  | "building"
  | "starting"
  | "healthy"
  | "switching"
  | "completed"
  | "failed"
  | "rolled_back";

interface Deployment {
  id: string;
  site_id: string;
  status: DeploymentStatus;
  started_at: string;
  completed_at: string | null;
  commit_sha: string | null;
  commit_message: string | null;
  error_message: string | null;
  steps: DeploymentStep[];
}

const STEP_ORDER: StepName[] = [
  "clone",
  "build",
  "start",
  "health_check",
  "switch",
  "register_actions",
];

const STEP_LABEL: Record<StepName, string> = {
  clone: "clone",
  build: "build",
  start: "start",
  health_check: "health check",
  switch: "switch",
  register_actions: "register actions",
};

const TERMINAL_STATUSES: ReadonlySet<DeploymentStatus> = new Set([
  "completed",
  "failed",
  "rolled_back",
]);

class DeploySiteDeploys extends HTMLElement {
  private siteId: string = "";
  private deployments: Deployment[] = [];
  private loading: boolean = true;
  private refreshInterval: number | null = null;
  // Tracks which deployments the user has manually toggled away from their default state.
  private expansionOverrides: Map<string, boolean> = new Map();

  static get observedAttributes() {
    return ["site-id"];
  }

  attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
    if (name === "site-id" && newValue) {
      this.siteId = newValue;
      this.loadDeployments();
    }
  }

  connectedCallback() {
    this.siteId = this.getAttribute("site-id") || "";
    if (this.siteId) {
      this.loadDeployments();
    }
  }

  disconnectedCallback() {
    this.stopPolling();
  }

  async loadDeployments() {
    try {
      const res = await fetch(
        `/api/sites/${this.siteId}/deployments?limit=20`,
        { credentials: "include" }
      );
      if (res.ok) {
        this.deployments = await res.json();
      }
    } catch (error) {
      console.error("Failed to load deployments:", error);
    } finally {
      this.loading = false;
      this.render();
      this.adjustPolling();
    }
  }

  /**
   * Run the 3s poll only while at least one deployment is in-flight.
   * Saves CPU when looking at history.
   */
  adjustPolling() {
    const hasActive = this.deployments.some(
      (d) => !TERMINAL_STATUSES.has(d.status)
    );
    if (hasActive && this.refreshInterval === null) {
      this.refreshInterval = window.setInterval(
        () => this.loadDeployments(),
        3000
      );
    } else if (!hasActive) {
      this.stopPolling();
    }
  }

  stopPolling() {
    if (this.refreshInterval !== null) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  isExpanded(deployment: Deployment): boolean {
    const override = this.expansionOverrides.get(deployment.id);
    if (override !== undefined) return override;
    // Default: expanded for active and failed deploys, collapsed for completed.
    if (!TERMINAL_STATUSES.has(deployment.status)) return true;
    if (deployment.status === "failed" || deployment.status === "rolled_back") {
      return true;
    }
    return false;
  }

  toggleExpansion(deploymentId: string) {
    const deployment = this.deployments.find((d) => d.id === deploymentId);
    if (!deployment) return;
    this.expansionOverrides.set(deploymentId, !this.isExpanded(deployment));
    this.render();
  }

  render() {
    if (this.loading) {
      this.innerHTML = `<div class="empty-state"><p>Loading deploys…</p></div>`;
      return;
    }

    if (this.deployments.length === 0) {
      this.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-title">No deployments yet</p>
          <p>Click Redeploy to deploy this site.</p>
        </div>
      `;
      return;
    }

    this.innerHTML = `
      <div class="waterfall-list">
        ${this.deployments.map((d) => this.renderCard(d)).join("")}
      </div>
    `;

    this.querySelectorAll<HTMLElement>("[data-toggle-deploy]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.toggleDeploy!;
        this.toggleExpansion(id);
      });
    });
  }

  renderCard(deployment: Deployment): string {
    const expanded = this.isExpanded(deployment);
    const terminal = TERMINAL_STATUSES.has(deployment.status);
    const totalDuration = formatTotalDuration(deployment);
    const startTime = new Date(deployment.started_at).toLocaleString();
    const statusBadge = renderStatusBadge(deployment);
    const commitChip = renderCommitChip(deployment);
    const bar = renderBar(deployment);
    const isLegacy = deployment.steps.length === 0 && terminal;

    return `
      <div class="waterfall-card ${terminal ? "" : "waterfall-card--active"} ${
      deployment.status === "failed" || deployment.status === "rolled_back"
        ? "waterfall-card--failed"
        : ""
    }">
        <button class="waterfall-header" data-toggle-deploy="${deployment.id}">
          <div class="waterfall-header-main">
            ${statusBadge}
            <span class="waterfall-duration">${totalDuration}</span>
            ${commitChip}
            <span class="waterfall-time">${startTime}</span>
          </div>
          <span class="waterfall-caret">${expanded ? "▾" : "▸"}</span>
        </button>

        ${
          isLegacy
            ? `<div class="waterfall-bar waterfall-bar--legacy" title="Step timing not recorded for this deploy"></div>`
            : bar
        }

        ${
          expanded
            ? `
          <div class="waterfall-steps">
            ${
              isLegacy
                ? `<p class="waterfall-legacy-note">Step timing wasn't recorded for this deploy.</p>`
                : this.renderSteps(deployment)
            }
            ${
              deployment.error_message
                ? `<div class="waterfall-error">${escapeHtml(
                    deployment.error_message
                  )}</div>`
                : ""
            }
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  renderSteps(deployment: Deployment): string {
    const terminal = TERMINAL_STATUSES.has(deployment.status);
    const stepsByName = new Map(deployment.steps.map((s) => [s.name, s]));
    // Render in canonical order so missing-but-skipped steps don't shuffle.
    const rendered: string[] = [];
    for (const name of STEP_ORDER) {
      const step = stepsByName.get(name);
      if (!step) continue;
      rendered.push(this.renderStepRow(step, terminal));
    }
    return rendered.join("");
  }

  renderStepRow(step: DeploymentStep, deploymentTerminal: boolean): string {
    // If the deployment is terminal but the step never closed, treat as failed
    // (handles process-crashed-mid-deploy case).
    let status: StepStatus = step.status;
    let errorMessage = step.error_message;
    if (status === "running" && deploymentTerminal) {
      status = "failed";
      errorMessage = errorMessage ?? "deploy interrupted";
    }

    const duration = formatStepDuration(step);
    const icon =
      status === "completed"
        ? `<span class="waterfall-step-icon waterfall-step-icon--ok">✓</span>`
        : status === "failed"
        ? `<span class="waterfall-step-icon waterfall-step-icon--fail">✗</span>`
        : `<span class="waterfall-step-icon waterfall-step-icon--running">⏵</span>`;
    return `
      <div class="waterfall-step waterfall-step--${status} waterfall-step--${step.name}">
        <span class="waterfall-step-duration">${duration}</span>
        <span class="waterfall-step-name">${STEP_LABEL[step.name]}</span>
        ${icon}
        ${
          errorMessage && status === "failed"
            ? `<span class="waterfall-step-error">${escapeHtml(
                errorMessage
              )}</span>`
            : ""
        }
      </div>
    `;
  }
}

/** Total duration: completed = end - start; in-progress = now - start. */
function formatTotalDuration(d: Deployment): string {
  const start = new Date(d.started_at).getTime();
  const end = d.completed_at ? new Date(d.completed_at).getTime() : Date.now();
  return formatDurationMs(end - start);
}

/** Per-step: end - start, falling back to now if running. */
function formatStepDuration(step: DeploymentStep): string {
  const start = new Date(step.started_at).getTime();
  const end = step.completed_at
    ? new Date(step.completed_at).getTime()
    : Date.now();
  return formatDurationMs(end - start, true);
}

/**
 * Format a duration in ms.
 * - tight=false: "30s" / "2m 04s" / "1h 12m" — for top-level totals.
 * - tight=true:  "0.34s" / "12.4s" / "2m 04s" — sub-second for short steps.
 */
function formatDurationMs(ms: number, tight: boolean = false): string {
  if (ms < 0) ms = 0;
  if (tight && ms < 60_000) {
    const seconds = ms / 1000;
    return seconds < 10 ? `${seconds.toFixed(2)}s` : `${seconds.toFixed(1)}s`;
  }
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}m ${String(s).padStart(2, "0")}s`;
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function renderStatusBadge(d: Deployment): string {
  const className = STATUS_BADGE_CLASS[d.status] ?? "";
  return `<span class="badge ${className}">${STATUS_LABEL[d.status] ?? d.status}</span>`;
}

const STATUS_LABEL: Record<DeploymentStatus, string> = {
  pending: "Pending",
  cloning: "Cloning",
  building: "Building",
  starting: "Starting",
  healthy: "Health Check",
  switching: "Switching",
  completed: "Completed",
  failed: "Failed",
  rolled_back: "Rolled Back",
};

const STATUS_BADGE_CLASS: Record<DeploymentStatus, string> = {
  pending: "badge-warning",
  cloning: "badge-warning",
  building: "badge-warning",
  starting: "badge-warning",
  healthy: "badge-warning",
  switching: "badge-warning",
  completed: "badge-success",
  failed: "badge-error",
  rolled_back: "badge-error",
};

function renderCommitChip(d: Deployment): string {
  if (!d.commit_sha) return "";
  const shortSha = d.commit_sha.substring(0, 7);
  const title = d.commit_message ?? "";
  return `<span class="waterfall-commit" title="${escapeHtml(title)}">${escapeHtml(
    shortSha
  )}</span>`;
}

/**
 * Build the stacked-segment bar.
 *
 * Completed deploys: segments fill the row 100%, sized proportionally.
 * In-progress deploys: completed + running segments size to (elapsed-of-total),
 * leaving the bar partial. The next 3s poll re-renders with a wider bar.
 */
function renderBar(d: Deployment): string {
  if (d.steps.length === 0) {
    return `<div class="waterfall-bar waterfall-bar--empty"></div>`;
  }

  const terminal = TERMINAL_STATUSES.has(d.status);
  const now = Date.now();

  // Compute per-step ms; running steps get elapsed-since-start.
  const segments = d.steps.map((s) => {
    const start = new Date(s.started_at).getTime();
    const end = s.completed_at ? new Date(s.completed_at).getTime() : now;
    return { name: s.name, status: s.status, ms: Math.max(0, end - start) };
  });
  const totalRecorded = segments.reduce((acc, s) => acc + s.ms, 0);

  // For terminal deploys, scale to 100%. For in-progress, scale against the
  // recorded total so the bar fills proportionally as steps complete; the bar
  // visually "grows" as time passes because totalRecorded grows on each poll.
  const scale = terminal && totalRecorded > 0 ? 100 / totalRecorded : 100 / Math.max(totalRecorded, 1);

  const segmentHtml = segments
    .map((s) => {
      const widthPct = s.ms * scale;
      const stripeClass =
        s.status === "running"
          ? "waterfall-segment--running"
          : s.status === "failed"
          ? "waterfall-segment--failed"
          : "";
      return `<span class="waterfall-segment waterfall-segment--${s.name} ${stripeClass}"
        style="width: ${widthPct.toFixed(2)}%"
        title="${STEP_LABEL[s.name]} — ${formatDurationMs(s.ms, true)}"></span>`;
    })
    .join("");

  return `<div class="waterfall-bar">${segmentHtml}</div>`;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

customElements.define("deploy-site-deploys", DeploySiteDeploys);
