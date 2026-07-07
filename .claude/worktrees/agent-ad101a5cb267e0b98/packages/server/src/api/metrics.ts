// ABOUTME: REST API endpoint for per-site container metrics time series.
// ABOUTME: Serves sampled CPU, memory, and network data for the live metrics charts.

import { containerMetricModel, siteModel } from "@keithk/deploy-core";
import { requireAuth } from "../middleware/auth";

/** Maximum number of samples returned per request (7d @ 5s = 120,960; cap at 4032 ≈ ~5.6h dense). */
const MAX_LIMIT = 4032;

/** Default look-back window: 1 hour. */
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Handle /api/sites/:id/metrics requests.
 * Returns Response if handled, null otherwise.
 */
export async function handleMetricsApi(
  request: Request,
  path: string
): Promise<Response | null> {
  // Only handle GET /api/sites/:id/metrics
  const pathParts = path.split("/").filter(Boolean);
  if (
    pathParts.length !== 4 ||
    pathParts[0] !== "api" ||
    pathParts[1] !== "sites" ||
    pathParts[3] !== "metrics"
  ) {
    return null;
  }

  if (request.method !== "GET") {
    return null;
  }

  const authResponse = requireAuth(request);
  if (authResponse) return authResponse;

  const siteId = pathParts[2];
  return handleGetMetrics(request, siteId);
}

async function handleGetMetrics(
  request: Request,
  siteId: string
): Promise<Response> {
  try {
    const site = siteModel.findById(siteId);
    if (!site) {
      return Response.json({ error: "Site not found" }, { status: 404 });
    }

    const url = new URL(request.url);

    // `since` — ISO-8601 string; defaults to 1 hour ago
    const sinceParam = url.searchParams.get("since");
    const since = sinceParam
      ? sinceParam
      : new Date(Date.now() - DEFAULT_WINDOW_MS).toISOString();

    // `limit` — positive integer, capped at MAX_LIMIT
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam
      ? Math.min(Math.max(1, parseInt(limitParam, 10)), MAX_LIMIT)
      : MAX_LIMIT;

    const samples = containerMetricModel.findBySite(siteId, since, limit);

    return Response.json({ site_id: siteId, samples });
  } catch (err) {
    console.error("Error fetching metrics:", err);
    return Response.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
}
