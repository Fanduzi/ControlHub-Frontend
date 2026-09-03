// input: controlledErrorCopy, CONTROLLED_ERROR_CODES, en/zh-CN errors.codes
// output: code-only operator copy; English message text is never selected
// pos: unit contract for Issue #69 console error localization
// note: if this file changes, update header and lib/README.md

import { describe, expect, it } from "vitest";

import { CONTROLLED_ERROR_CODES } from "@/lib/controlled-error-codes";
import { controlledErrorCopy } from "@/lib/controlled-error-copy";
import en from "@/messages/en.json";
import zhCN from "@/messages/zh-CN.json";

function translator(messages: typeof en) {
  const errors = messages.errors as {
    codes: Record<string, string>;
    unknownCode: string;
    unavailable: string;
    auth: string;
  };
  const t = ((key: string, values?: Record<string, string>) => {
    if (key.startsWith("codes.")) {
      return errors.codes[key.slice("codes.".length)] ?? key;
    }
    if (key === "unknownCode") {
      return errors.unknownCode.replace("{code}", values?.code ?? "");
    }
    if (key === "unavailable") return errors.unavailable;
    if (key === "auth") return errors.auth;
    return key;
  }) as ((key: string, values?: Record<string, string>) => string) & {
    has: (key: string) => boolean;
  };
  t.has = (key: string) => {
    if (key.startsWith("codes.")) {
      return Boolean(errors.codes[key.slice("codes.".length)]);
    }
    return key in errors;
  };
  return t;
}

describe("controlledErrorCopy", () => {
  it("defines localized copy for every Controlled Error Code", () => {
    for (const code of CONTROLLED_ERROR_CODES) {
      expect(en.errors.codes[code], `en.errors.codes.${code}`).toBeTruthy();
      expect(zhCN.errors.codes[code], `zh-CN.errors.codes.${code}`).toBeTruthy();
    }
  });

  it("renders validation_failed from the catalog, not the English message", () => {
    const copy = controlledErrorCopy(translator(zhCN), {
      status: 400,
      code: "validation_failed",
    });
    expect(copy).toBe("校验失败。请检查请求后重试。");
    expect(copy).not.toContain("environmentId must be a positive integer");
  });

  it("keeps unknown codes generic and includes the code, not the English message", () => {
    const copy = controlledErrorCopy(translator(zhCN), {
      status: 500,
      code: "not_a_published_code",
    });
    expect(copy).toContain("not_a_published_code");
    expect(copy).toBe("发生受控失败（not_a_published_code）。");
  });

  it("treats a missing code as unavailability except unauthenticated 401", () => {
    expect(
      controlledErrorCopy(translator(en), { status: 500 }),
    ).toBe("The request could not be completed. Try again.");
    expect(
      controlledErrorCopy(translator(en), { status: 401 }),
    ).toBe("Authentication failed. Please sign in again.");
  });
});
