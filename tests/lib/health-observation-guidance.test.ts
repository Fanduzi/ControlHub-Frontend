// input: hasMissingCollectorHealthObservation
// output: transitional unknown health is ignored; running+unknown is collector absence
// pos: unit contract for Issue #71 empty-state guidance
// note: if this file changes, update header and lib/README.md

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
