import { describe, expect, it } from "vitest";

import { hasMissingCollectorHealthObservation } from "@/lib/health-observation-guidance";

describe("hasMissingCollectorHealthObservation", () => {
  it("is true for running CIs with unknown health", () => {
    expect(
      hasMissingCollectorHealthObservation([
        { healthStatus: "unknown", lifecycleStatus: "running" },
      ]),
    ).toBe(true);
  });

  it("ignores unknown health during provisioning or decommissioning", () => {
    expect(
      hasMissingCollectorHealthObservation([
        { healthStatus: "unknown", lifecycleStatus: "provisioning" },
        { healthStatus: "unknown", lifecycleStatus: "decommissioning" },
      ]),
    ).toBe(false);
  });
});
