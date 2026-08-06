import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import zhCN from "@/messages/zh-CN.json";

type Messages = { queryWorkbench: { savedStatements: Record<string, unknown> } };

const TEMPLATE_KEYS = [
  "templateModeBanner",
  "templateModeHint",
  "templateValueMissing",
  "templateValueInvalid",
  "templateValueOversized",
  "templateValueUnknown",
];

describe("queryWorkbench.savedStatements template locale parity", () => {
  it("zh-CN defines every template key present in en", () => {
    const enKeys = Object.keys((en as Messages).queryWorkbench.savedStatements);
    const zhKeys = Object.keys((zhCN as Messages).queryWorkbench.savedStatements);
    for (const key of TEMPLATE_KEYS) {
      expect(enKeys, `en missing queryWorkbench.savedStatements.${key}`).toContain(key);
      expect(zhKeys, `zh-CN missing queryWorkbench.savedStatements.${key}`).toContain(key);
    }
  });

  it("zh-CN template values are translated, non-empty strings", () => {
    const zh = (zhCN as Messages).queryWorkbench.savedStatements;
    for (const key of TEMPLATE_KEYS) {
      expect(zh[key], `missing zh-CN queryWorkbench.savedStatements.${key}`).toBeTruthy();
      expect(typeof zh[key]).toBe("string");
    }
  });
});
