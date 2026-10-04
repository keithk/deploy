// ABOUTME: Tests for waking sleeping sites — the status a site lands in after
// ABOUTME: a successful wake, a slow health check, and an unrecoverable failure.

import { describe, test, expect, beforeEach, mock } from "bun:test";

const sleepingSite = {
  id: "site-1",
  name: "sleepy",
  status: "sleeping",
  container_id: "container-1",
  port: 8003,
};

let currentSite: typeof sleepingSite | null = sleepingSite;
let healthy = true;
let startFails = false;

const updateStatusMock = mock(() => {});

mock.module("@keithk/deploy-core", () => ({
  info: mock(() => {}),
  error: mock(() => {}),
  siteModel: {
    findById: mock(() => currentSite),
    updateStatus: updateStatusMock,
  },
}));

mock.module("../src/services/container", () => ({
  waitForContainerHealth: mock(async () => healthy),
}));

const startSiteContainerMock = mock(async () => {
  if (startFails) throw new Error("No such container");
});
const stopSiteContainerMock = mock(async () => {});

mock.module("../src/services/site-ops", () => ({
  startSiteContainer: startSiteContainerMock,
  stopSiteContainer: stopSiteContainerMock,
}));

const { wakeSite } = await import("../src/services/wake");

beforeEach(() => {
  currentSite = { ...sleepingSite };
  healthy = true;
  startFails = false;
  updateStatusMock.mockClear();
  stopSiteContainerMock.mockClear();
});

describe("wakeSite", () => {
  test("marks the site running once the container is healthy", async () => {
    await wakeSite("site-1");

    expect(updateStatusMock).toHaveBeenCalledWith("site-1", "running", "container-1", 8003);
    expect(stopSiteContainerMock).not.toHaveBeenCalled();
  });

  test("puts the site back to sleep when the health check times out, so the next visit retries", async () => {
    healthy = false;

    await wakeSite("site-1");

    expect(stopSiteContainerMock).toHaveBeenCalledTimes(1);
    expect(updateStatusMock).toHaveBeenCalledWith("site-1", "sleeping", "container-1", 8003);
    expect(updateStatusMock).not.toHaveBeenCalledWith("site-1", "error");
  });

  test("marks the site errored when its container cannot be started", async () => {
    startFails = true;

    await wakeSite("site-1");

    expect(updateStatusMock).toHaveBeenCalledWith("site-1", "error");
  });

  test("does nothing for a site that is not sleeping", async () => {
    currentSite = { ...sleepingSite, status: "running" };

    await wakeSite("site-1");

    expect(updateStatusMock).not.toHaveBeenCalled();
  });
});
