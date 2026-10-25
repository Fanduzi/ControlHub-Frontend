import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import zhCN from "@/messages/zh-CN.json";

type Messages = {
  queryWorkbench: {
    error: Record<string, string>;
    workspace: Record<string, string>;
    history: Record<string, unknown>;
  };
};

const KEYS = [
  ["error", "query_workspace_conflict"],
  ["error", "query_execution_not_found"],
  ["workspace", "reload"],
  ["workspace", "loadError"],
  ["workspace", "saveError"],
  ["workspace", "limitReached"],
  ["workspace", "retry"],
  ["history", "restore"],
  ["history", "restoreFailed"],
] as const;

describe("query workbench workspace/history locale parity", () => {
  it("defines every new English key in zh-CN", () => {
    const enMessages = en as Messages;
    const zhMessages = zhCN as Messages;
    for (const [section, key] of KEYS) {
      expect(enMessages.queryWorkbench[section][key]).toBeTruthy();
      expect(zhMessages.queryWorkbench[section][key]).toBeTruthy();
    }
  });
});
