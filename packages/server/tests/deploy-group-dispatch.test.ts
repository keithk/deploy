// ABOUTME: Tests group-wide deployment dispatch without global module mocks.
// ABOUTME: Verifies every current group member starts through the site deploy boundary.

import { describe, expect, mock, test } from "bun:test";
import { triggerDeployGroup } from "../src/services/deploy-group";

describe("triggerDeployGroup", () => {
  test("triggers every group member without waiting serially", () => {
    const deploy = mock(() => Promise.resolve({ success: true }));
    const reportError = mock(() => undefined);

    triggerDeployGroup({
      sites: [
        { id: "site-1", name: "at-one" },
        { id: "site-2", name: "at-two" },
      ],
    }, deploy, reportError);

    expect(deploy).toHaveBeenCalledTimes(2);
    expect(deploy).toHaveBeenCalledWith("site-1");
    expect(deploy).toHaveBeenCalledWith("site-2");
  });
});
