/**
 * HTTP API client for Dial Up Deploy.
 * Wraps calls to the admin API with session authentication.
 */

import type { Site } from "@keithk/deploy-core";

export interface ClientOptions {
  apiUrl: string;
  sessionToken: string;
}

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

export class DeployApiClient {
  private apiUrl: string;
  private sessionToken: string;

  constructor(options: ClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/$/, ""); // Remove trailing slash
    this.sessionToken = options.sessionToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const requestInit: RequestInit = {
      method,
      headers,
    };

    // Add session token as query param (more reliable than cookie for MCP context)
    const urlObj = new URL(url);
    urlObj.searchParams.set("token", this.sessionToken);

    if (body) {
      requestInit.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(urlObj.toString(), requestInit);

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json();
          if (errorBody.error) {
            errorMessage = errorBody.error;
          }
        } catch {
          // Use default error message if body is not JSON
        }

        const error: ApiError = {
          status: response.status,
          message: errorMessage,
        };
        throw error;
      }

      if (response.status === 204) {
        // No content response
        return {} as T;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof TypeError) {
        throw {
          status: 0,
          message: `Network error: ${error.message}`,
        } as ApiError;
      }
      if (error && typeof error === "object" && "status" in error) {
        throw error;
      }
      throw {
        status: 0,
        message: `Unknown error: ${error}`,
      } as ApiError;
    }
  }

  // List all sites
  async listSites(): Promise<Site[]> {
    return this.request<Site[]>("GET", "/api/sites");
  }

  // Get a single site by ID
  async getSite(siteId: string): Promise<Site> {
    return this.request<Site>("GET", `/api/sites/${siteId}`);
  }

  // Find a site by name (requires listing all sites and filtering)
  async findSiteByName(name: string): Promise<Site | null> {
    const sites = await this.listSites();
    return sites.find((s) => s.name === name) || null;
  }

  // Trigger a deployment
  async deploySite(siteId: string): Promise<{ message: string; site_id: string }> {
    return this.request("POST", `/api/sites/${siteId}/deploy`, {});
  }

  // Get logs for a site
  async getSiteLogs(
    siteId: string,
    type?: "build" | "runtime",
    limit: number = 50
  ): Promise<Array<{ id: string; content: string; timestamp: string; type: string }>> {
    let path = `/api/sites/${siteId}/logs?limit=${limit}`;
    if (type) {
      path += `&type=${type}`;
    }
    return this.request(path, "GET");
  }

  // Update a site (PATCH)
  async updateSite(
    siteId: string,
    updates: Record<string, unknown>
  ): Promise<Site> {
    return this.request<Site>("PATCH", `/api/sites/${siteId}`, updates);
  }

  // Set custom domain on a site
  async setCustomDomain(siteId: string, domain: string | null): Promise<Site> {
    return this.updateSite(siteId, { custom_domain: domain });
  }

  // Get environment variables for a site
  async getEnvVars(
    siteId: string
  ): Promise<{ user: Record<string, string>; system: Record<string, string> }> {
    return this.request("GET", `/api/sites/${siteId}/env`, undefined);
  }

  // Update environment variables for a site
  async setEnvVars(
    siteId: string,
    vars: Record<string, string>
  ): Promise<{ message: string; env_vars: Record<string, string> }> {
    return this.request(
      "PATCH",
      `/api/sites/${siteId}/env`,
      vars
    );
  }
}
