// ABOUTME: Site detail page with tabs for logs, environment, and settings
// ABOUTME: Shows site info header and tabbed content area

import { showToast } from './toast.js';
import { showConfirm } from './confirm-dialog.js';
import { showInput } from './input-dialog.js';

interface Site {
  id: string;
  name: string;
  subdomain?: string;
  status: "running" | "stopped" | "building" | "error" | "sleeping";
  visibility?: "public" | "private";
  gitUrl?: string;
  git_url?: string;
  persistent_storage?: number;
  autodeploy?: number;
  sleep_enabled?: number;
  sleep_after_minutes?: number | null;
  last_request_at?: string | null;
  custom_domains?: string;
  port?: number | null;
  type?: "auto" | "passthrough" | "compose";
  build_sources?: string;
}

interface BuildSource {
  type: "git" | "path";
  source: string;
  dest: string;
  branch?: string;
}

interface LogEntry {
  id: string;
  content: string;
  timestamp: string;
  type: string;
}

interface EnvVar {
  key: string;
  value: string;
  isSystem?: boolean;
}

class DeploySiteDetail extends HTMLElement {
  private siteId: string = "";
  private site: Site | null = null;
  private loading: boolean = true;
  private activeTab: "deploys" | "build" | "runtime" | "environment" | "settings" | "metrics" = "deploys";
  private logs: LogEntry[] = [];
  private userEnvVars: EnvVar[] = [];
  private systemEnvVars: EnvVar[] = [];
  private autoRefresh: boolean = true;
  private refreshInterval: number | null = null;

  static get observedAttributes() {
    return ["site-id"];
  }

  attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
    if (name === "site-id" && newValue) {
      this.siteId = newValue;
      this.loadSite();
    }
  }

  connectedCallback() {
    // Check for tab query param
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (
      tab === "deploys" ||
      tab === "build" ||
      tab === "runtime" ||
      tab === "environment" ||
      tab === "settings" ||
      tab === "metrics"
    ) {
      this.activeTab = tab;
    }

    this.siteId = this.getAttribute("site-id") || "";
    if (this.siteId) {
      this.loadSite();
    }
  }

  disconnectedCallback() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  getDomain(): string {
    return window.location.hostname.split(".").slice(-2).join(".");
  }

  getCustomDomains(): string[] {
    if (!this.site?.custom_domains) return [];
    try {
      const domains = JSON.parse(this.site.custom_domains);
      return Array.isArray(domains) ? domains : [];
    } catch {
      return [];
    }
  }

  async saveCustomDomains(domains: string[]) {
    if (!this.site) return;

    try {
      const response = await fetch(`/api/sites/${this.siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ custom_domains: domains }),
      });

      if (response.ok) {
        const updated = await response.json();
        this.site.custom_domains = updated.custom_domains;
        this.render();
      } else {
        const error = await response.json();
        showToast(`Failed to update custom domains: ${error.message || error.error || "Unknown error"}`, 'error');
      }
    } catch (error) {
      console.error("Failed to update custom domains:", error);
      showToast("Failed to update custom domains", 'error');
    }
  }

  getBuildSources(): BuildSource[] {
    if (!this.site?.build_sources) return [];
    try {
      const sources = JSON.parse(this.site.build_sources);
      return Array.isArray(sources) ? sources : [];
    } catch {
      return [];
    }
  }

  async saveBuildSources(sources: BuildSource[]) {
    if (!this.site) return;

    try {
      const response = await fetch(`/api/sites/${this.siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ build_sources: sources }),
      });

      if (response.ok) {
        const updated = await response.json();
        this.site.build_sources = updated.build_sources;
        this.render();
        showToast("Build sources saved. They apply on the next deploy.", 'success');
      } else {
        const error = await response.json();
        showToast(`Failed to update build sources: ${error.error || error.message || "Unknown error"}`, 'error');
      }
    } catch (error) {
      console.error("Failed to update build sources:", error);
      showToast("Failed to update build sources", 'error');
    }
  }

  async handleAddBuildSource() {
    const typeInput = this.querySelector<HTMLSelectElement>("#build-source-type");
    const sourceInput = this.querySelector<HTMLInputElement>("#build-source-source");
    const destInput = this.querySelector<HTMLInputElement>("#build-source-dest");
    const branchInput = this.querySelector<HTMLInputElement>("#build-source-branch");
    if (!typeInput || !sourceInput || !destInput) return;

    const type = typeInput.value === "path" ? "path" : "git";
    const source = sourceInput.value.trim();
    const dest = destInput.value.trim();
    const branch = branchInput?.value.trim() ?? "";

    if (!source || !dest) {
      showToast("A build source needs both a source and a destination.", 'error');
      return;
    }

    const current = this.getBuildSources();
    if (current.some((entry) => entry.dest === dest)) {
      showToast(`Something already builds into ${dest}.`, 'error');
      return;
    }

    await this.saveBuildSources([
      ...current,
      { type, source, dest, ...(type === "git" && branch ? { branch } : {}) },
    ]);
  }

  async handleRemoveBuildSource(dest: string) {
    const confirmed = await showConfirm(
      'Remove Build Source',
      `Stop copying into "${dest}" on deploy?`,
      { confirmText: 'Remove', destructive: true }
    );
    if (!confirmed) return;

    await this.saveBuildSources(this.getBuildSources().filter((entry) => entry.dest !== dest));
  }

  async handleAddCustomDomain() {
    const input = this.querySelector<HTMLInputElement>("#custom-domain-input");
    if (!input) return;

    const domain = input.value.trim().toLowerCase();
    if (!domain) return;

    // A leading `*.` makes the entry match every single-label subdomain.
    const hostnamePattern = /^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
    if (!hostnamePattern.test(domain)) {
      showToast("Enter a valid domain, e.g. example.com or *.example.com", 'error');
      return;
    }

    const current = this.getCustomDomains();
    if (current.includes(domain)) {
      showToast("That domain is already added.", 'error');
      return;
    }

    await this.saveCustomDomains([...current, domain]);
  }

  async handleRemoveCustomDomain(domain: string) {
    const confirmed = await showConfirm(
      'Remove Custom Domain',
      `Remove "${domain}" from this site?`,
      { confirmText: 'Remove', destructive: true }
    );
    if (!confirmed) return;

    await this.saveCustomDomains(this.getCustomDomains().filter((d) => d !== domain));
  }

  async loadSite() {
    this.loading = true;
    this.render();

    try {
      const response = await fetch(`/api/sites/${this.siteId}`);
      if (response.ok) {
        this.site = await response.json();
        if (this.isConnected && this.site) {
          document.title = `${this.site.name} · deploy`;
        }
        await this.loadTabData();
      }
    } catch (error) {
      console.error("Failed to load site:", error);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async loadTabData() {
    if (this.activeTab === "build" || this.activeTab === "runtime") {
      await this.loadLogs();
      if (this.autoRefresh && this.refreshInterval === null) {
        this.refreshInterval = window.setInterval(
          () => this.loadLogs().then(() => this.render()),
          3000
        );
      }
    } else if (this.activeTab === "environment") {
      await this.loadEnvVars();
    }

    if (
      this.activeTab !== "build" &&
      this.activeTab !== "runtime" &&
      this.refreshInterval !== null
    ) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async loadLogs() {
    try {
      const type = this.activeTab === "runtime" ? "runtime" : "build";
      const response = await fetch(
        `/api/sites/${this.siteId}/logs?type=${type}&limit=100`
      );
      if (response.ok) {
        this.logs = await response.json();
      }
    } catch (error) {
      console.error("Failed to load logs:", error);
    }
  }

  async loadEnvVars() {
    try {
      const response = await fetch(`/api/sites/${this.siteId}/env`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        this.userEnvVars = Object.entries(data.user || {}).map(
          ([key, value]) => ({ key, value: value as string })
        );
        this.systemEnvVars = Object.entries(data.system || {}).map(
          ([key, value]) => ({ key, value: value as string, isSystem: true })
        );
      }
    } catch (error) {
      console.error("Failed to load env vars:", error);
      this.userEnvVars = [];
      this.systemEnvVars = [];
    }
  }

  async switchTab(
    tab: "deploys" | "build" | "runtime" | "environment" | "settings" | "metrics"
  ) {
    this.activeTab = tab;
    await this.loadTabData();
    this.render();
  }

  toggleAutoRefresh() {
    this.autoRefresh = !this.autoRefresh;

    if (this.autoRefresh) {
      this.refreshInterval = window.setInterval(
        () => this.loadLogs().then(() => this.render()),
        3000
      );
    } else if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    this.render();
  }

  async handleRedeploy() {
    try {
      const response = await fetch(`/api/sites/${this.siteId}/deploy`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        this.activeTab = "deploys";
        this.render();
      } else {
        const error = await response.json();
        showToast(`Failed to redeploy: ${error.message || "Unknown error"}`, 'error');
      }
    } catch (error) {
      console.error("Redeploy failed:", error);
      showToast("Failed to redeploy site", 'error');
    }
  }

  async handleVisibilityChange(visibility: "public" | "private") {
    try {
      const response = await fetch(`/api/sites/${this.siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ visibility }),
      });

      if (response.ok && this.site) {
        this.site.visibility = visibility;
        this.render();
      }
    } catch (error) {
      console.error("Failed to update visibility:", error);
    }
  }

  async handleStorageToggle() {
    if (!this.site) return;

    const newValue = !this.site.persistent_storage;
    const action = newValue ? "enable" : "disable";

    const confirmed = await showConfirm(
      'Persistent Storage',
      `${action.charAt(0).toUpperCase() + action.slice(1)} persistent storage? This requires a redeploy.`
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/sites/${this.siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ persistent_storage: newValue }),
      });

      if (response.ok) {
        this.site.persistent_storage = newValue ? 1 : 0;
        this.render();
      }
    } catch (error) {
      console.error("Failed to toggle storage:", error);
    }
  }

  async handleAutodeployToggle() {
    if (!this.site) return;

    const newValue = !this.site.autodeploy;
    const gitUrl = this.site.git_url || this.site.gitUrl;

    if (!gitUrl) {
      showToast("Cannot enable autodeploy: no git URL configured for this site.", 'error');
      return;
    }

    // Check if GitHub is configured
    try {
      const statusResponse = await fetch("/api/github/status", {
        credentials: "include",
      });
      const status = await statusResponse.json();
      if (!status.configured) {
        showToast(
          "Cannot enable autodeploy: GitHub token not configured. Go to Settings to add your token.",
          'error'
        );
        return;
      }
    } catch (error) {
      console.error("Failed to check GitHub status:", error);
      showToast("Failed to check GitHub configuration.", 'error');
      return;
    }

    try {
      // Update the site's autodeploy setting
      const response = await fetch(`/api/sites/${this.siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ autodeploy: newValue }),
      });

      if (!response.ok) {
        const error = await response.json();
        showToast(
          `Failed to update autodeploy: ${error.message || "Unknown error"}`,
          'error'
        );
        return;
      }

      // Create or delete the webhook on GitHub
      const webhookMethod = newValue ? "POST" : "DELETE";
      const webhookResponse = await fetch("/api/github/webhooks", {
        method: webhookMethod,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ git_url: gitUrl }),
      });

      if (!webhookResponse.ok) {
        const error = await webhookResponse.json();
        // Revert the autodeploy setting
        await fetch(`/api/sites/${this.siteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ autodeploy: !newValue }),
        });
        showToast(
          `Failed to ${newValue ? "create" : "delete"} webhook: ${
            error.error || "Unknown error"
          }`,
          'error'
        );
        return;
      }

      this.site.autodeploy = newValue ? 1 : 0;
      this.render();
    } catch (error) {
      console.error("Failed to toggle autodeploy:", error);
      showToast("Failed to toggle autodeploy.", 'error');
    }
  }

  async handleSleepToggle() {
    if (!this.site) return;

    const newValue = !this.site.sleep_enabled;

    try {
      const response = await fetch(`/api/sites/${this.siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sleep_enabled: newValue }),
      });

      if (response.ok) {
        this.site.sleep_enabled = newValue ? 1 : 0;
        this.render();
      } else {
        const error = await response.json();
        showToast(`Failed to update sleep setting: ${error.message || "Unknown error"}`, 'error');
      }
    } catch (error) {
      console.error("Failed to toggle sleep:", error);
      showToast("Failed to update sleep setting", 'error');
    }
  }

  async handleSleepThresholdChange(value: string) {
    if (!this.site) return;

    const minutes = value === "" ? null : parseInt(value, 10);

    try {
      const response = await fetch(`/api/sites/${this.siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sleep_after_minutes: minutes }),
      });

      if (response.ok) {
        this.site.sleep_after_minutes = minutes;
        this.render();
      } else {
        const error = await response.json();
        showToast(`Failed to update sleep threshold: ${error.message || "Unknown error"}`, 'error');
      }
    } catch (error) {
      console.error("Failed to update sleep threshold:", error);
      showToast("Failed to update sleep threshold", 'error');
    }
  }

  async handleWakeNow() {
    try {
      const response = await fetch(`/api/sites/${this.siteId}/deploy`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        showToast("Waking site...", 'success');
        await this.loadSite();
      } else {
        const error = await response.json();
        showToast(`Failed to wake site: ${error.message || "Unknown error"}`, 'error');
      }
    } catch (error) {
      console.error("Wake failed:", error);
      showToast("Failed to wake site", 'error');
    }
  }

  async handleDelete() {
    if (!this.site) return;

    const confirmed = await showConfirm(
      'Delete Site',
      `Delete ${this.site.name}? This cannot be undone.`,
      { confirmText: 'Delete', destructive: true }
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/sites/${this.siteId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        window.location.href = "/";
      } else {
        const error = await response.json();
        showToast(`Failed to delete: ${error.message || "Unknown error"}`, 'error');
      }
    } catch (error) {
      console.error("Delete failed:", error);
    }
  }

  async handleAddEnvVar() {
    const key = await showInput("Variable name:", { placeholder: "MY_VAR" });
    if (!key) return;

    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      showToast(
        "Invalid variable name. Use letters, numbers, and underscores only.",
        'error'
      );
      return;
    }

    const value = await showInput(`Value for ${key}:`, { placeholder: "value" });
    if (value === null) return;

    await this.saveEnvVar(key, value);
  }

  async handleEditEnvVar(key: string) {
    const currentVar = this.userEnvVars.find((v) => v.key === key);
    const value = await showInput(`New value for ${key}:`, {
      initialValue: currentVar?.value || "",
    });
    if (value === null) return;

    await this.saveEnvVar(key, value);
  }

  async handleDeleteEnvVar(key: string) {
    const confirmed = await showConfirm(
      'Delete Variable',
      `Delete environment variable "${key}"?`,
      { confirmText: 'Delete', destructive: true }
    );
    if (!confirmed) return;

    try {
      // Get current vars and remove the key
      const currentVars: Record<string, string> = {};
      for (const v of this.userEnvVars) {
        if (v.key !== key) {
          currentVars[v.key] = v.value;
        }
      }

      const response = await fetch(`/api/sites/${this.siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ env_vars: JSON.stringify(currentVars) }),
      });

      if (response.ok) {
        await this.loadEnvVars();
        this.render();
      } else {
        const error = await response.json();
        showToast(`Failed to delete variable: ${error.message || "Unknown error"}`, 'error');
      }
    } catch (error) {
      console.error("Failed to delete env var:", error);
      showToast("Failed to delete environment variable", 'error');
    }
  }

  async saveEnvVar(key: string, value: string) {
    try {
      const response = await fetch(`/api/sites/${this.siteId}/env`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [key]: value }),
      });

      if (response.ok) {
        await this.loadEnvVars();
        this.render();
      } else {
        const error = await response.json();
        showToast(`Failed to save variable: ${error.message || "Unknown error"}`, 'error');
      }
    } catch (error) {
      console.error("Failed to save env var:", error);
      showToast("Failed to save environment variable", 'error');
    }
  }

  render() {
    if (this.loading) {
      this.innerHTML = `
        <a href="/" class="back-link" data-route>&larr; Back to Sites</a>
        <div class="empty-state">
          <p>Loading site...</p>
        </div>
      `;
      return;
    }

    if (!this.site) {
      this.innerHTML = `
        <a href="/" class="back-link" data-route>&larr; Back to Sites</a>
        <div class="empty-state">
          <p class="empty-state-title">Site not found</p>
        </div>
      `;
      return;
    }

    const domain = this.getDomain();
    const siteUrl = `https://${
      this.site.subdomain || this.site.name
    }.${domain}`;
    const siteState = this.site.status === "running"
      ? "LIVE"
      : this.site.status === "sleeping"
        ? "ASLEEP"
        : this.site.status.toUpperCase();
    const deploymentMode = this.site.type === "compose" ? "compose" : "blue-green";

    this.innerHTML = `
      <a href="/" class="back-link" data-route>&larr; SITES</a>

      <div class="site-detail-header">
        <div class="site-detail-info">
          <span class="site-detail-prefix">┌ SITE:</span>
          <h1 class="site-detail-title">${this.site.name}</h1>
          <span class="site-detail-state status-${this.site.status}">● ${siteState}</span>
          <div class="site-detail-meta">
            <a href="${siteUrl}" target="_blank">${this.site.subdomain || this.site.name}.${domain}</a>
            <span>· PORT ${this.site.port ?? "--"}</span>
            <span>· ${deploymentMode}</span>
          </div>
        </div>
        <div class="site-detail-actions">
          <button class="btn btn-primary" id="redeploy-btn">REDEPLOY</button>
          <a href="${siteUrl}" target="_blank" class="btn">OPEN</a>
        </div>
      </div>

      <div class="tabs">
        <button class="tab ${
          this.activeTab === "deploys" ? "active" : ""
        }" data-tab="deploys">DEPLOYS</button>
        <button class="tab ${
          this.activeTab === "build" ? "active" : ""
        }" data-tab="build">BUILD LOGS</button>
        <button class="tab ${
          this.activeTab === "runtime" ? "active" : ""
        }" data-tab="runtime">RUNTIME LOGS</button>
        <button class="tab ${
          this.activeTab === "environment" ? "active" : ""
        }" data-tab="environment">ENVIRONMENT</button>
        <button class="tab ${
          this.activeTab === "settings" ? "active" : ""
        }" data-tab="settings">SETTINGS</button>
        <button class="tab ${
          this.activeTab === "metrics" ? "active" : ""
        }" data-tab="metrics">METRICS</button>
      </div>

      <div class="tab-content">
        ${this.renderTabContent()}
      </div>
    `;

    // Event listeners
    this.querySelector("#redeploy-btn")?.addEventListener("click", () =>
      this.handleRedeploy()
    );

    this.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        const tabName = (e.currentTarget as HTMLElement).dataset.tab as any;
        this.switchTab(tabName);
      });
    });

    if (this.activeTab === "build" || this.activeTab === "runtime") {
      this.querySelector("#auto-refresh-btn")?.addEventListener("click", () =>
        this.toggleAutoRefresh()
      );
    }

    if (this.activeTab === "settings") {
      this.querySelectorAll('input[name="visibility"]').forEach((radio) => {
        radio.addEventListener("change", (e) => {
          const value = (e.target as HTMLInputElement).value as
            | "public"
            | "private";
          this.handleVisibilityChange(value);
        });
      });

      this.querySelector("#autodeploy-checkbox")?.addEventListener(
        "change",
        () => this.handleAutodeployToggle()
      );
      this.querySelector("#storage-checkbox")?.addEventListener("change", () =>
        this.handleStorageToggle()
      );
      this.querySelector("#sleep-checkbox")?.addEventListener("change", () =>
        this.handleSleepToggle()
      );
      this.querySelector("#sleep-threshold")?.addEventListener("change", (e) => {
        this.handleSleepThresholdChange((e.target as HTMLSelectElement).value);
      });
      this.querySelector("#wake-btn")?.addEventListener("click", () =>
        this.handleWakeNow()
      );
      this.querySelector("#add-domain-btn")?.addEventListener("click", () =>
        this.handleAddCustomDomain()
      );
      this.querySelector("#custom-domain-input")?.addEventListener(
        "keydown",
        (e) => {
          if ((e as KeyboardEvent).key === "Enter") {
            e.preventDefault();
            this.handleAddCustomDomain();
          }
        }
      );
      this.querySelectorAll("[data-remove-domain]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const domain = (e.currentTarget as HTMLElement).dataset.removeDomain!;
          this.handleRemoveCustomDomain(domain);
        });
      });
      this.querySelector("#add-build-source-btn")?.addEventListener("click", () =>
        this.handleAddBuildSource()
      );
      this.querySelectorAll("[data-remove-build-source]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const dest = (e.currentTarget as HTMLElement).dataset.removeBuildSource!;
          this.handleRemoveBuildSource(dest);
        });
      });
      this.querySelector("#delete-btn")?.addEventListener("click", () =>
        this.handleDelete()
      );
    }

    if (this.activeTab === "environment") {
      this.querySelector("#add-env-btn")?.addEventListener("click", () =>
        this.handleAddEnvVar()
      );
      this.querySelectorAll("[data-edit-key]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const key = (e.currentTarget as HTMLElement).dataset.editKey!;
          this.handleEditEnvVar(key);
        });
      });
      this.querySelectorAll("[data-delete-key]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const key = (e.currentTarget as HTMLElement).dataset.deleteKey!;
          this.handleDeleteEnvVar(key);
        });
      });
    }
  }

  renderTabContent(): string {
    switch (this.activeTab) {
      case "deploys":
        return this.renderDeploysTab();
      case "build":
      case "runtime":
        return this.renderLogsTab();
      case "environment":
        return this.renderEnvironmentTab();
      case "settings":
        return this.renderSettingsTab();
      case "metrics":
        return this.renderMetricsTab();
      default:
        return "";
    }
  }

  renderMetricsTab(): string {
    const status = this.site?.status ?? "";
    return `<deploy-site-metrics site-id="${this.siteId}" site-status="${status}"></deploy-site-metrics>`;
  }

  renderDeploysTab(): string {
    return `<deploy-site-deploys site-id="${this.siteId}"></deploy-site-deploys>`;
  }

  renderLogsTab(): string {
    const title = this.activeTab === "runtime" ? "RUNTIME STREAM" : "BUILD STREAM";

    return `
      <div class="logs-header">
        <span class="logs-title">── ${title} ── tail -f ·</span>
        <button class="log-refresh ${this.autoRefresh ? "active" : ""}" id="auto-refresh-btn">
          auto-refresh ${this.autoRefresh ? "ON" : "OFF"}
        </button>
        <span class="logs-title">──</span>
      </div>
      <div class="logs-container">
        ${
          this.logs.length === 0
            ? '<p class="text-muted">No logs available</p>'
            : ""
        }
        ${this.logs
          .map((log) => {
            const isError =
              log.content.toLowerCase().includes("error") ||
              log.content.includes("[ERROR]");
            const isSuccess =
              log.content.toLowerCase().includes("complete") ||
              log.content.toLowerCase().includes("success");
            const lineClass = isError ? "error" : isSuccess ? "success" : "";
            const time = new Date(log.timestamp).toLocaleTimeString();

            return `
            <div class="log-line ${lineClass}">
              <span class="log-time">[${time}]</span>
              <span class="log-content">${this.escapeHtml(log.content)}</span>
            </div>
          `;
          })
          .join("")}
        <div class="terminal-log-prompt" aria-hidden="true"><span>&gt;</span><i class="terminal-cursor"></i></div>
      </div>
    `;
  }

  renderEnvironmentTab(): string {
    const hasUserVars = this.userEnvVars.length > 0;
    const hasSystemVars = this.systemEnvVars.length > 0;

    return `
      <div class="settings-section">
        <h3 class="settings-section-title">User Variables</h3>
        ${
          !hasUserVars
            ? '<p class="text-muted">No user-defined environment variables</p>'
            : `<div class="env-table">
            ${this.userEnvVars
              .map(
                (env) => `
              <div class="env-row">
                <div class="env-cell env-key">${this.escapeHtml(env.key)}</div>
                <div class="env-cell env-value">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</div>
                <div class="env-cell">
                  <button class="btn btn-sm btn-ghost" data-edit-key="${this.escapeHtml(
                    env.key
                  )}">Edit</button>
                  <button class="btn btn-sm btn-ghost btn-danger" data-delete-key="${this.escapeHtml(
                    env.key
                  )}">Delete</button>
                </div>
              </div>
            `
              )
              .join("")}
          </div>`
        }
        <div class="mt-4">
          <button class="btn" id="add-env-btn">+ Add Variable</button>
        </div>
      </div>

      ${
        hasSystemVars
          ? `
      <div class="settings-section">
        <h3 class="settings-section-title">System Variables</h3>
        <p class="text-muted mb-4">These are automatically set by the platform and cannot be modified.</p>
        <div class="env-table">
          ${this.systemEnvVars
            .map(
              (env) => `
            <div class="env-row">
              <div class="env-cell env-key">${this.escapeHtml(env.key)}</div>
              <div class="env-cell env-value">${this.escapeHtml(
                env.value
              )}</div>
              <div class="env-cell"></div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
      `
          : ""
      }
    `;
  }

  renderSettingsTab(): string {
    const isPublic = this.site?.visibility === "public";
    const hasStorage = this.site?.persistent_storage;
    const hasAutodeploy = this.site?.autodeploy;
    const hasGitUrl = this.site?.git_url || this.site?.gitUrl;

    return `
      <div class="settings-section">
        <h3 class="settings-section-title">Visibility</h3>
        <div class="form-radio-group">
          <label class="form-radio">
            <input type="radio" name="visibility" value="public" ${
              isPublic ? "checked" : ""
            }>
            <span>Public</span>
          </label>
          <label class="form-radio">
            <input type="radio" name="visibility" value="private" ${
              !isPublic ? "checked" : ""
            }>
            <span>Private</span>
          </label>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">Autodeploy</h3>
        <label class="form-checkbox">
          <input type="checkbox" id="autodeploy-checkbox" ${
            hasAutodeploy ? "checked" : ""
          } ${!hasGitUrl ? "disabled" : ""}>
          <span>Deploy automatically when code is pushed to GitHub</span>
        </label>
        <p class="text-muted mt-4">${
          hasGitUrl
            ? "Creates a webhook on the GitHub repository."
            : "Requires a GitHub repository URL."
        }</p>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">Persistent Storage</h3>
        <label class="form-checkbox">
          <input type="checkbox" id="storage-checkbox" ${
            hasStorage ? "checked" : ""
          }>
          <span>Enable persistent /data volume</span>
        </label>
        <p class="text-muted mt-4">When enabled, data written to /data will persist across redeploys.</p>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">Sleep</h3>
        <label class="form-checkbox">
          <input type="checkbox" id="sleep-checkbox" ${
            this.site?.sleep_enabled ? "checked" : ""
          }>
          <span>Put site to sleep after inactivity</span>
        </label>
        <p class="text-muted mt-4">Sleeping sites stop their container and wake automatically on the next request.</p>

        <div class="form-group mt-4">
          <label class="form-label" for="sleep-threshold">Sleep after</label>
          <select id="sleep-threshold" class="form-select" ${
            !this.site?.sleep_enabled ? "disabled" : ""
          }>
            <option value="" ${
              this.site?.sleep_after_minutes == null ? "selected" : ""
            }>Use server default</option>
            <option value="5" ${
              this.site?.sleep_after_minutes === 5 ? "selected" : ""
            }>5 minutes</option>
            <option value="30" ${
              this.site?.sleep_after_minutes === 30 ? "selected" : ""
            }>30 minutes</option>
            <option value="60" ${
              this.site?.sleep_after_minutes === 60 ? "selected" : ""
            }>1 hour</option>
          </select>
        </div>

        ${this.site?.status === "sleeping" ? `
          <div class="sleep-status mt-4">
            <span class="text-muted">This site is currently sleeping.</span>
            <button class="btn btn-sm" id="wake-btn">Wake now</button>
          </div>
        ` : ""}

        ${this.site?.last_request_at ? `
          <p class="text-muted mt-4" style="font-size: var(--text-xs)">
            Last request: ${new Date(this.site.last_request_at).toLocaleString()}
          </p>
        ` : ""}
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">Custom Domains</h3>
        <p class="text-muted mb-4">Point your own domains at this site. DNS must resolve to this server first.</p>
        ${
          this.getCustomDomains().length === 0
            ? '<p class="text-muted">No custom domains configured</p>'
            : `<div class="env-table">
            ${this.getCustomDomains()
              .map(
                (domain) => `
              <div class="env-row">
                <div class="env-cell env-key">${this.escapeHtml(domain)}</div>
                <div class="env-cell">
                  <button class="btn btn-sm btn-ghost btn-danger" data-remove-domain="${this.escapeHtml(
                    domain
                  )}">Remove</button>
                </div>
              </div>
            `
              )
              .join("")}
          </div>`
        }
        <div class="form-group mt-4" style="display: flex; gap: var(--space-2);">
          <input type="text" id="custom-domain-input" class="form-input" placeholder="example.com">
          <button class="btn" id="add-domain-btn">Add</button>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">Build Sources</h3>
        <p class="text-muted mb-4">
          Copied into the build context on every deploy, before the image is built. Use these for a
          private repository or a directory of licensed files that must not live in this site's own
          repository. Paths are relative to the checkout, which is <code>/app</code> inside the build.
        </p>
        ${
          this.getBuildSources().length === 0
            ? '<p class="text-muted">No build sources configured</p>'
            : `<div class="env-table">
            ${this.getBuildSources()
              .map(
                (source) => `
              <div class="env-row">
                <div class="env-cell env-key">${this.escapeHtml(source.dest)}</div>
                <div class="env-cell env-value">${this.escapeHtml(
                  source.type === "git"
                    ? `git ${source.source}${source.branch ? ` (${source.branch})` : ""}`
                    : `path ${source.source}`
                )}</div>
                <div class="env-cell">
                  <button class="btn btn-sm btn-ghost btn-danger" data-remove-build-source="${this.escapeHtml(
                    source.dest
                  )}">Remove</button>
                </div>
              </div>
            `
              )
              .join("")}
          </div>`
        }
        <div class="form-group mt-4" style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
          <select id="build-source-type" class="form-input" style="flex: 0 0 auto;">
            <option value="git">Git repo</option>
            <option value="path">Server path</option>
          </select>
          <input type="text" id="build-source-source" class="form-input" style="flex: 2 1 16rem;" placeholder="https://github.com/you/private-plugin.git">
          <input type="text" id="build-source-dest" class="form-input" style="flex: 1 1 10rem;" placeholder="vendor/plugin">
          <input type="text" id="build-source-branch" class="form-input" style="flex: 0 1 8rem;" placeholder="main">
          <button class="btn" id="add-build-source-btn">Add</button>
        </div>
      </div>

      <div class="settings-section danger">
        <h3 class="settings-section-title">Danger Zone</h3>
        <p class="text-muted mb-4">Permanently delete this site and all associated data.</p>
        <button class="btn btn-danger" id="delete-btn">Delete Site</button>
      </div>
    `;
  }

  escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define("deploy-site-detail", DeploySiteDetail);
