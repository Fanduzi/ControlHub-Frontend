import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import zhCN from "@/messages/zh-CN.json";

type Messages = { queryWorkbench: { paging: Record<string, string> } };

describe("queryWorkbench.paging locale parity", () => {
  it("zh-CN defines every paging key present in en", () => {
    const enPaging = (en as Messages).queryWorkbench.paging;
    const zhPaging = (zhCN as Messages).queryWorkbench.paging;
    expect(Object.keys(zhPaging).sort()).toEqual(Object.keys(enPaging).sort());
  });

  it("zh-CN paging values are translated, non-empty strings", () => {
    const zhPaging = (zhCN as Messages).queryWorkbench.paging;
    for (const key of ["previousPage", "nextPage", "page", "pageSize"]) {
      expect(zhPaging[key], `missing zh-CN queryWorkbench.paging.${key}`).toBeTruthy();
      expect(typeof zhPaging[key]).toBe("string");
    }
    expect(zhPaging.page).toContain("{page}");
  });
});
