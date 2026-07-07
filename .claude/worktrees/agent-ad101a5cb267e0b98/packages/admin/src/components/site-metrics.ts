// ABOUTME: Per-site live metrics component — CPU, memory, network charts.
// ABOUTME: Polls /api/sites/:id/metrics every 5s while mounted; stops on disconnect.

interface MetricSample {
  id: string;
  site_id: string;
  recorded_at: string;
  cpu_pct: number;
  mem_bytes: number;
  mem_limit_bytes: number;
  net_rx_bytes: number;
  net_tx_bytes: number;
}

type TimeWindow = "1h" | "6h" | "24h" | "7d";

const WINDOW_MS: Record<TimeWindow, number> = {
  "1h":  1 * 60 * 60 * 1000,
  "6h":  6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d":  7 * 24 * 60 * 60 * 1000,
};

// Maximum rows the server will return; also caps the limit param we send.
const WINDOW_LIMIT: Record<TimeWindow, number> = {
  "1h":  720,     // 1h @ 5s
  "6h":  4032,    // 6h @ 5s (server cap)
  "24h": 4032,
  "7d":  4032,
};

const POLL_INTERVAL_MS = 5_000;
const CHART_HEIGHT = 120;
const CHART_WIDTH = 800; // viewBox width; scales with CSS
const CHART_PADDING = { top: 8, right: 4, bottom: 20, left: 50 };

class DeploySiteMetrics extends HTMLElement {
  private siteId: string = "";
  private window: TimeWindow = "1h";
  private samples: MetricSample[] = [];
  private loading: boolean = true;
  private pollInterval: number | null = null;
  private siteStatus: string = "";

  static get observedAttributes() {
    return ["site-id", "site-status"];
  }

  attributeChangedCallback(name: string, _old: string, value: string) {
    if (name === "site-id" && value) {
      this.siteId = value;
      this.fetchMetrics();
    }
    if (name === "site-status") {
      this.siteStatus = value;
    }
  }

  connectedCallback() {
    this.siteId = this.getAttribute("site-id") || "";
    this.siteStatus = this.getAttribute("site-status") || "";
    if (this.siteId) {
      this.fetchMetrics();
      this.startPolling();
    }
  }

  disconnectedCallback() {
    this.stopPolling();
  }

  startPolling() {
    if (this.pollInterval !== null) return;
    this.pollInterval = window.setInterval(() => this.fetchMetrics(), POLL_INTERVAL_MS);
  }

  stopPolling() {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async fetchMetrics() {
    const since = new Date(Date.now() - WINDOW_MS[this.window]).toISOString();
    const limit = WINDOW_LIMIT[this.window];
    try {
      const res = await fetch(
        `/api/sites/${this.siteId}/metrics?since=${encodeURIComponent(since)}&limit=${limit}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data: { site_id: string; samples: MetricSample[] } = await res.json();
        this.samples = data.samples;
      }
    } catch (err) {
      console.error("Failed to fetch metrics:", err);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  setWindow(w: TimeWindow) {
    this.window = w;
    this.loading = true;
    this.render();
    this.fetchMetrics();
  }

  render() {
    const isRunning = this.siteStatus === "running";

    if (!isRunning) {
      this.innerHTML = `
        <div class="metrics-empty">
          <p class="metrics-empty-msg">No metrics — container is not running.</p>
        </div>
      `;
      return;
    }

    if (this.loading) {
      this.innerHTML = `<div class="metrics-empty"><p class="metrics-empty-msg">Loading metrics…</p></div>`;
      return;
    }

    if (this.samples.length === 0) {
      this.innerHTML = `
        <div class="metrics-empty">
          <p class="metrics-empty-msg">No data yet. Metrics are collected every 5 seconds once the poller is running.</p>
        </div>
      `;
      return;
    }

    const windows: TimeWindow[] = ["1h", "6h", "24h", "7d"];
    const windowButtons = windows
      .map(
        (w) =>
          `<button class="metrics-window-btn ${w === this.window ? "active" : ""}" data-window="${w}">${w}</button>`
      )
      .join("");

    const cpuChart = this.renderCpuChart();
    const memChart = this.renderMemChart();
    const netChart = this.renderNetChart();

    const firstTs = new Date(this.samples[0].recorded_at).toLocaleTimeString();
    const lastTs = new Date(this.samples[this.samples.length - 1].recorded_at).toLocaleTimeString();

    this.innerHTML = `
      <div class="metrics-root">
        <div class="metrics-controls">
          <div class="metrics-window-group">
            ${windowButtons}
          </div>
          <span class="metrics-time-range">${firstTs} — ${lastTs}</span>
        </div>

        <div class="metrics-panel">
          <div class="metrics-panel-label">CPU %</div>
          ${cpuChart}
        </div>

        <div class="metrics-panel">
          <div class="metrics-panel-label">Memory</div>
          ${memChart}
        </div>

        <div class="metrics-panel">
          <div class="metrics-panel-label">Network I/O</div>
          <div class="metrics-legend">
            <span class="metrics-legend-rx">rx</span>
            <span class="metrics-legend-tx">tx</span>
          </div>
          ${netChart}
        </div>
      </div>
    `;

    this.querySelectorAll<HTMLElement>(".metrics-window-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.setWindow(btn.dataset.window as TimeWindow);
      });
    });
  }

  // ----- chart rendering helpers -----

  private getPlotBounds() {
    return {
      x0: CHART_PADDING.left,
      y0: CHART_PADDING.top,
      x1: CHART_WIDTH - CHART_PADDING.right,
      y1: CHART_HEIGHT - CHART_PADDING.bottom,
    };
  }

  private mapX(index: number, total: number, x0: number, x1: number): number {
    if (total <= 1) return (x0 + x1) / 2;
    return x0 + (index / (total - 1)) * (x1 - x0);
  }

  private mapY(value: number, min: number, max: number, y0: number, y1: number): number {
    if (max === min) return (y0 + y1) / 2;
    // SVG Y is top-down; higher value = lower Y number
    return y1 - ((value - min) / (max - min)) * (y1 - y0);
  }

  private buildAreaPath(
    points: { x: number; y: number }[],
    y1: number
  ): string {
    if (points.length === 0) return "";
    const linePts = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const lastX = points[points.length - 1].x.toFixed(1);
    const firstX = points[0].x.toFixed(1);
    return `${linePts} L${lastX},${y1.toFixed(1)} L${firstX},${y1.toFixed(1)} Z`;
  }

  private buildLinePath(points: { x: number; y: number }[]): string {
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  }

  private yAxisLabels(
    min: number,
    max: number,
    y0: number,
    y1: number,
    x0: number,
    formatter: (v: number) => string
  ): string {
    const labels = [
      { value: max, y: y0 },
      { value: (min + max) / 2, y: (y0 + y1) / 2 },
      { value: min, y: y1 },
    ];
    return labels
      .map(
        (l) =>
          `<text class="metrics-axis-label" x="${(x0 - 4).toFixed(0)}" y="${l.y.toFixed(0)}" text-anchor="end" dominant-baseline="middle">${formatter(l.value)}</text>`
      )
      .join("");
  }

  private xAxisLabels(
    samples: MetricSample[],
    x0: number,
    x1: number,
    y1: number
  ): string {
    if (samples.length < 2) return "";
    const first = new Date(samples[0].recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const last = new Date(samples[samples.length - 1].recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `
      <text class="metrics-axis-label" x="${x0}" y="${(y1 + 14).toFixed(0)}" text-anchor="start">${first}</text>
      <text class="metrics-axis-label" x="${x1}" y="${(y1 + 14).toFixed(0)}" text-anchor="end">${last}</text>
    `;
  }

  private svgWrapper(inner: string): string {
    return `<svg class="metrics-chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>`;
  }

  renderCpuChart(): string {
    const { x0, y0, x1, y1 } = this.getPlotBounds();
    const n = this.samples.length;

    const values = this.samples.map((s) => s.cpu_pct);
    const maxVal = Math.max(100, ...values); // CPU always 0–100 minimum
    const minVal = 0;

    const points = this.samples.map((s, i) => ({
      x: this.mapX(i, n, x0, x1),
      y: this.mapY(s.cpu_pct, minVal, maxVal, y0, y1),
    }));

    const areaPath = this.buildAreaPath(points, y1);
    const linePath = this.buildLinePath(points);
    const yLabels = this.yAxisLabels(minVal, maxVal, y0, y1, x0, (v) => `${v.toFixed(0)}%`);
    const xLabels = this.xAxisLabels(this.samples, x0, x1, y1);

    return this.svgWrapper(`
      <path class="metrics-area metrics-area-cpu" d="${areaPath}"/>
      <path class="metrics-line metrics-line-cpu" d="${linePath}" fill="none"/>
      ${yLabels}
      ${xLabels}
    `);
  }

  renderMemChart(): string {
    const { x0, y0, x1, y1 } = this.getPlotBounds();
    const n = this.samples.length;

    const maxLimit = Math.max(...this.samples.map((s) => s.mem_limit_bytes));
    const maxVal = maxLimit > 0 ? maxLimit : Math.max(...this.samples.map((s) => s.mem_bytes));
    const minVal = 0;

    const points = this.samples.map((s, i) => ({
      x: this.mapX(i, n, x0, x1),
      y: this.mapY(s.mem_bytes, minVal, maxVal, y0, y1),
    }));

    const areaPath = this.buildAreaPath(points, y1);
    const linePath = this.buildLinePath(points);
    const yLabels = this.yAxisLabels(minVal, maxVal, y0, y1, x0, (v) =>
      v >= 1_073_741_824
        ? `${(v / 1_073_741_824).toFixed(1)}GiB`
        : `${(v / 1_048_576).toFixed(0)}MiB`
    );
    const xLabels = this.xAxisLabels(this.samples, x0, x1, y1);

    return this.svgWrapper(`
      <path class="metrics-area metrics-area-mem" d="${areaPath}"/>
      <path class="metrics-line metrics-line-mem" d="${linePath}" fill="none"/>
      ${yLabels}
      ${xLabels}
    `);
  }

  renderNetChart(): string {
    const { x0, y0, x1, y1 } = this.getPlotBounds();
    const n = this.samples.length;
    if (n < 2) {
      // Need at least 2 samples to compute deltas
      return this.svgWrapper(`<text class="metrics-axis-label" x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2}" text-anchor="middle">Collecting…</text>`);
    }

    // Compute per-5s byte deltas; sample[0] has no previous → skip
    const rxDeltas: number[] = [];
    const txDeltas: number[] = [];
    for (let i = 1; i < n; i++) {
      const dtMs = new Date(this.samples[i].recorded_at).getTime() -
                   new Date(this.samples[i - 1].recorded_at).getTime();
      const dtSec = Math.max(dtMs / 1000, 1);
      rxDeltas.push(Math.max(0, this.samples[i].net_rx_bytes - this.samples[i - 1].net_rx_bytes) / dtSec);
      txDeltas.push(Math.max(0, this.samples[i].net_tx_bytes - this.samples[i - 1].net_tx_bytes) / dtSec);
    }

    // Use samples[1..] for X positions (aligned with deltas)
    const deltaSamples = this.samples.slice(1);
    const allValues = [...rxDeltas, ...txDeltas];
    const maxVal = Math.max(1, ...allValues); // avoid zero-range
    const minVal = 0;

    const rxPoints = deltaSamples.map((s, i) => ({
      x: this.mapX(i, deltaSamples.length, x0, x1),
      y: this.mapY(rxDeltas[i], minVal, maxVal, y0, y1),
    }));
    const txPoints = deltaSamples.map((s, i) => ({
      x: this.mapX(i, deltaSamples.length, x0, x1),
      y: this.mapY(txDeltas[i], minVal, maxVal, y0, y1),
    }));

    const rxPath = this.buildLinePath(rxPoints);
    const txPath = this.buildLinePath(txPoints);

    const yLabels = this.yAxisLabels(minVal, maxVal, y0, y1, x0, (v) =>
      v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}MB/s`
      : v >= 1_000   ? `${(v / 1_000).toFixed(1)}KB/s`
      :                `${v.toFixed(0)}B/s`
    );
    const xLabels = this.xAxisLabels(deltaSamples, x0, x1, y1);

    return this.svgWrapper(`
      <path class="metrics-line metrics-line-rx" d="${rxPath}" fill="none"/>
      <path class="metrics-line metrics-line-tx" d="${txPath}" fill="none"/>
      ${yLabels}
      ${xLabels}
    `);
  }
}

customElements.define("deploy-site-metrics", DeploySiteMetrics);
