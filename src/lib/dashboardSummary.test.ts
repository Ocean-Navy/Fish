import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { combinedDashboardDataState } from "@/lib/dashboardSummary";

import type { DataState } from "@/lib/types";

describe("combinedDashboardDataState", () => {
  it("does not promote mixed dashboard sources to live", () => {
    const states: DataState[] = ["sample", "live", "unavailable"];

    assert.equal(combinedDashboardDataState(states), "unavailable");
  });

  it("preserves sample and snapshot component labels in combined dashboard state", () => {
    assert.equal(combinedDashboardDataState(["live", "sample", "snapshot"]), "sample");
    assert.equal(combinedDashboardDataState(["live", "snapshot"]), "snapshot");
    assert.equal(combinedDashboardDataState(["live", "live"]), "live");
  });
});
