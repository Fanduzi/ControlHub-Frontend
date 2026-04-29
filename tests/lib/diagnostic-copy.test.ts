import { describe, expect, it } from "vitest";

import {
  buildMissingDataKey,
  buildStatusReasonKey,
  buildStatusReasonSentenceKey,
} from "@/lib/diagnostic-copy";

describe("diagnostic copy helpers", () => {
  describe("buildStatusReasonKey", () => {
    it("builds field/value status reason keys for health status", () => {
      expect(buildStatusReasonKey("healthStatus", "critical")).toEqual({
        fieldKey: "diagnostics.fields.healthStatus",
        valueKey: "statusValues.critical",
        fallbackKey: "diagnostics.reasons.healthStatus.critical",
      });
    });

    it("builds field/value status reason keys for lifecycle status", () => {
      expect(buildStatusReasonKey("lifecycleStatus", "stopped")).toEqual({
        fieldKey: "diagnostics.fields.lifecycleStatus",
        valueKey: "statusValues.stopped",
        fallbackKey: "diagnostics.reasons.lifecycleStatus.stopped",
      });
    });

    it("builds keys for warning health", () => {
      expect(buildStatusReasonKey("healthStatus", "warning")).toEqual({
        fieldKey: "diagnostics.fields.healthStatus",
        valueKey: "statusValues.warning",
        fallbackKey: "diagnostics.reasons.healthStatus.warning",
      });
    });

    it("builds keys for degraded lifecycle", () => {
      expect(buildStatusReasonKey("lifecycleStatus", "degraded")).toEqual({
        fieldKey: "diagnostics.fields.lifecycleStatus",
        valueKey: "statusValues.degraded",
        fallbackKey: "diagnostics.reasons.lifecycleStatus.degraded",
      });
    });
  });

  describe("buildStatusReasonSentenceKey", () => {
    it("builds sentence keys for critical health", () => {
      expect(buildStatusReasonSentenceKey("healthStatus", "critical")).toBe(
        "diagnostics.sentences.healthStatus.critical",
      );
    });

    it("builds sentence keys for stopped lifecycle", () => {
      expect(buildStatusReasonSentenceKey("lifecycleStatus", "stopped")).toBe(
        "diagnostics.sentences.lifecycleStatus.stopped",
      );
    });
  });

  describe("buildMissingDataKey", () => {
    it("builds missing data keys for all kinds", () => {
      expect(buildMissingDataKey("role")).toBe("diagnostics.missing.role");
      expect(buildMissingDataKey("profile")).toBe("diagnostics.missing.profile");
      expect(buildMissingDataKey("connection")).toBe("diagnostics.missing.connection");
      expect(buildMissingDataKey("audit")).toBe("diagnostics.missing.audit");
    });
  });
});
