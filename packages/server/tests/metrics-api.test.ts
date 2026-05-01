// ABOUTME: Integration tests for GET /api/sites/:id/metrics.
// ABOUTME: Validates auth enforcement, site-not-found, and correct sample response shape.

import { describe, test, expect, beforeEach, mock } from "bun:test";

const SITE_ID = "site-abc";

const mockSite = {
  id: SITE_ID,
  name: "test-site",
  status: "running" as const,
};

const mockSamples = [
  {
    id: "uuid-1",
    site_id: SITE_ID,
    recorded_at: "2026-04-26T10:00:00.000Z",
    cpu_pct: 5.5,
    mem_bytes: 104_857_600,
    mem_limit_bytes: 536_870_912,
    net_rx_bytes: 1_024,
    net_tx_bytes: 512,
  },
  {
    id: "uuid-2",
    site_id: SITE_ID,
    recorded_at: "2026-04-26T10:00:05.000Z",
    cpu_pct: 6.1,
    mem_bytes: 110_100_480,
    mem_limit_bytes: 536_870_912,
    net_rx_bytes: 2_048,
    net_tx_bytes: 1_024,
  },
];

const mockSession = {
  token: "valid-session-token",
  id: "session-id",
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

let mockFindBySite: ReturnType<typeof mock>;
let mockSiteFindById: ReturnType<typeof mock>;
let mockSessionFind: ReturnType<typeof mock>;

mock.module("@keithk/deploy-core", () => {
  mockFindBySite = mock((_siteId: string, _since: string, _limit?: number) => mockSamples);
  mockSiteFindById = mock((id: string) => (id === SITE_ID ? mockSite : null));
  mockSessionFind = mock((token: string) => (token === "valid-session-token" ? mockSession : null));

  return {
    containerMetricModel: {
      findBySite: mockFindBySite,
    },
    siteModel: {
      findById: mockSiteFindById,
      findByName: mock(() => null),
    },
    sessionModel: {
      findByToken: mockSessionFind,
    },
    shareLinkModel: {
      findByToken: mock(() => null),
    },
    info: mock(() => {}),
    debug: mock(() => {}),
    error: mock(() => {}),
  };
});

const { handleMetricsApi } = await import("../src/api/metrics");

function makeRequest(
  path: string,
  options: { auth?: boolean; method?: string } = {}
): Request {
  const { auth = true, method = "GET" } = options;
  const headers = new Headers();
  if (auth) {
    headers.set("Cookie", "session=valid-session-token");
  }
  return new Request(`http://admin.example.com${path}`, { method, headers });
}

beforeEach(() => {
  mockFindBySite.mockClear();
  mockSiteFindById.mockClear();
  mockSessionFind.mockClear();
});

describe("GET /api/sites/:id/metrics", () => {
  test("returns 401 when not authenticated", async () => {
    const req = makeRequest(`/api/sites/${SITE_ID}/metrics`, { auth: false });
    const res = await handleMetricsApi(req, `/api/sites/${SITE_ID}/metrics`);
    expect(res?.status).toBe(401);
  });

  test("returns null for non-metrics paths", async () => {
    const req = makeRequest(`/api/sites/${SITE_ID}/logs`);
    const res = await handleMetricsApi(req, `/api/sites/${SITE_ID}/logs`);
    expect(res).toBeNull();
  });

  test("returns null for non-GET methods", async () => {
    const req = makeRequest(`/api/sites/${SITE_ID}/metrics`, { method: "POST" });
    const res = await handleMetricsApi(req, `/api/sites/${SITE_ID}/metrics`);
    expect(res).toBeNull();
  });

  test("returns 404 when site does not exist", async () => {
    const req = makeRequest("/api/sites/nonexistent/metrics");
    const res = await handleMetricsApi(req, "/api/sites/nonexistent/metrics");
    expect(res?.status).toBe(404);
    const body = await res?.json();
    expect(body.error).toBe("Site not found");
  });

  test("returns 200 with site_id and samples array", async () => {
    const req = makeRequest(`/api/sites/${SITE_ID}/metrics`);
    const res = await handleMetricsApi(req, `/api/sites/${SITE_ID}/metrics`);
    expect(res?.status).toBe(200);

    const body = await res?.json();
    expect(body.site_id).toBe(SITE_ID);
    expect(Array.isArray(body.samples)).toBe(true);
    expect(body.samples).toHaveLength(2);
  });

  test("samples contain all required fields", async () => {
    const req = makeRequest(`/api/sites/${SITE_ID}/metrics`);
    const res = await handleMetricsApi(req, `/api/sites/${SITE_ID}/metrics`);
    const body = await res?.json();
    const sample = body.samples[0];

    expect(typeof sample.id).toBe("string");
    expect(typeof sample.site_id).toBe("string");
    expect(typeof sample.recorded_at).toBe("string");
    expect(typeof sample.cpu_pct).toBe("number");
    expect(typeof sample.mem_bytes).toBe("number");
    expect(typeof sample.mem_limit_bytes).toBe("number");
    expect(typeof sample.net_rx_bytes).toBe("number");
    expect(typeof sample.net_tx_bytes).toBe("number");
  });

  test("passes the since param through to the model", async () => {
    const since = "2026-04-26T09:00:00.000Z";
    const req = makeRequest(`/api/sites/${SITE_ID}/metrics?since=${encodeURIComponent(since)}`);
    await handleMetricsApi(req, `/api/sites/${SITE_ID}/metrics`);

    expect(mockFindBySite).toHaveBeenCalledTimes(1);
    const [, calledSince] = (mockFindBySite.mock.calls[0] as [string, string, number?]);
    expect(calledSince).toBe(since);
  });

  test("default since is approximately 1 hour ago", async () => {
    const beforeCall = new Date(Date.now() - 60 * 60 * 1000 - 2000);
    const afterCall  = new Date(Date.now() - 60 * 60 * 1000 + 2000);

    const req = makeRequest(`/api/sites/${SITE_ID}/metrics`);
    await handleMetricsApi(req, `/api/sites/${SITE_ID}/metrics`);

    const [, calledSince] = (mockFindBySite.mock.calls[0] as [string, string, number?]);
    const sinceMs = new Date(calledSince).getTime();
    expect(sinceMs).toBeGreaterThan(beforeCall.getTime());
    expect(sinceMs).toBeLessThan(afterCall.getTime());
  });

  test("respects the limit query param", async () => {
    const req = makeRequest(`/api/sites/${SITE_ID}/metrics?limit=100`);
    await handleMetricsApi(req, `/api/sites/${SITE_ID}/metrics`);

    const [, , calledLimit] = (mockFindBySite.mock.calls[0] as [string, string, number?]);
    expect(calledLimit).toBe(100);
  });

  test("caps limit at 4032", async () => {
    const req = makeRequest(`/api/sites/${SITE_ID}/metrics?limit=999999`);
    await handleMetricsApi(req, `/api/sites/${SITE_ID}/metrics`);

    const [, , calledLimit] = (mockFindBySite.mock.calls[0] as [string, string, number?]);
    expect(calledLimit).toBe(4032);
  });
});
