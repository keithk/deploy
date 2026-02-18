// ABOUTME: Site detail page with tabs for logs, environment, and settings
// ABOUTME: Shows site info header and tabbed content area

import { showToast } from './toast.js';
import { showConfirm } from './confirm-dialog.js';
import { showInput } from './input-dialog.js';

interface Site {
  id: string;
  name: string;
  subdomain?: string;
  status: "running" | "stopped" | "building" | "error";
  visibility?: "public" | "private";
  gitUrl?: string;
  git_url?: string;
  persistent_storage?: number;
  autodeploy?: number;
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
  private activeTab: "build" | "runtime" | "environment" | "settings" = "build";
  private logs: LogEntry[] = [];
  private userEnvVars: EnvVar[] = [];
  private systemEnvVars: EnvVar[] = [];
  private autoRefresh: boolean = false;
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
    if (tab === "environment" || tab === "settings" || tab === "runtime") {
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

  async loadSite() {
    this.loading = true;
    this.render();

    try {
      const response = await fetch(`/api/sites/${this.siteId}`);
      if (response.ok) {
        this.site = await response.json();
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
    } else if (this.activeTab === "environment") {
      await this.loadEnvVars();
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

  async switchTab(tab: "build" | "runtime" | "environment" | "settings") {
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
        this.activeTab = "build";
        await this.loadLogs();
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

    this.innerHTML = `
      <a href="/" class="back-link" data-route>&larr; Back to Sites</a>

      <div class="site-detail-header">
        <div class="site-detail-info">
          <div class="site-status ${this.site.status}"></div>
          <div>
            <h1 class="site-detail-title">${this.site.name}</h1>
            <div class="site-detail-meta">
              <a href="${siteUrl}" target="_blank">${siteUrl}</a>
              ${
                this.site.gitUrl
                  ? `<a href="${this.site.gitUrl}" target="_blank">${this.site.gitUrl}</a>`
                  : ""
              }
            </div>
          </div>
        </div>
        <div class="site-detail-actions">
          <button class="btn" id="redeploy-btn">Redeploy</button>
          <a href="${siteUrl}" target="_blank" class="btn">Open</a>
        </div>
      </div>

      <div class="tabs">
        <button class="tab ${
          this.activeTab === "build" ? "active" : ""
        }" data-tab="build">Build Logs</button>
        <button class="tab ${
          this.activeTab === "runtime" ? "active" : ""
        }" data-tab="runtime">Runtime Logs</button>
        <button class="tab ${
          this.activeTab === "environment" ? "active" : ""
        }" data-tab="environment">Environment</button>
        <button class="tab ${
          this.activeTab === "settings" ? "active" : ""
        }" data-tab="settings">Settings</button>
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
      case "build":
      case "runtime":
        return this.renderLogsTab();
      case "environment":
        return this.renderEnvironmentTab();
      case "settings":
        return this.renderSettingsTab();
      default:
        return "";
    }
  }

  renderLogsTab(): string {
    const title = this.activeTab === "runtime" ? "Runtime Logs" : "Build Logs";

    return `
      <div class="logs-header">
        <span class="logs-title">${title}</span>
        <button class="btn btn-sm ${
          this.autoRefresh ? "btn-primary" : ""
        }" id="auto-refresh-btn">
          ${this.autoRefresh ? "Auto-refresh ON" : "Auto-refresh"}
        </button>
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
              <span class="log-time">${time}</span>
              <span class="log-content">${this.escapeHtml(log.content)}</span>
            </div>
          `;
          })
          .join("")}
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
