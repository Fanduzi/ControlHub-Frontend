import { NextIntlClientProvider } from "next-intl";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/components/blocks/status-badge";
import messages from "@/messages/en.json";

function renderLifecycleBadge(status: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <StatusBadge status={status} tone="lifecycle" />
    </NextIntlClientProvider>,
  );
}

describe("StatusBadge lifecycle tones", () => {
  it("colors running with the primary lifecycle tone instead of the muted default", () => {
    const { container } = renderLifecycleBadge("running");
    const badge = container.querySelector("[data-status=running]");
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain("data-[status=running]:bg-primary/10");
    expect(badge?.className).not.toContain("data-[status=active]:bg-primary/10");
  });

  it("colors degraded lifecycle distinctly from stopped", () => {
    const { container } = renderLifecycleBadge("degraded");
    const badge = container.querySelector("[data-status=degraded]");
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain("data-[status=degraded]:bg-orange-500/10");
  });
});
