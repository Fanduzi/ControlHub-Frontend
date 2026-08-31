// input: next-intl, @testing-library/react, @testing-library/user-event, @/app/login/page, @/messages/zh-CN.json
// output: Vitest coverage for localized LoginPage validation and safe post-login return paths
// pos: app-boundary test for the public login page
// note: if this file changes, update header and tests/app/README.md
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import LoginPage from "@/app/login/page";
import messages from "@/messages/zh-CN.json";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("LoginPage email validation", () => {
  beforeEach(() => {
    push.mockClear();
    window.history.replaceState({}, "", "/login");
    vi.unstubAllGlobals();
  });

  it("shows the Chinese required email message", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="zh-CN" messages={messages}>
        <LoginPage />
      </NextIntlClientProvider>,
    );

    await user.type(screen.getByLabelText("密码"), "secret");
    await user.click(screen.getByRole("button", { name: "进入控制台" }));

    expect(screen.getByText("请输入邮箱")).toBeInTheDocument();
  });

  it("shows the Chinese invalid email message", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="zh-CN" messages={messages}>
        <LoginPage />
      </NextIntlClientProvider>,
    );

    await user.type(screen.getByLabelText("邮箱"), "not-an-email");
    await user.type(screen.getByLabelText("密码"), "secret");
    await user.click(screen.getByRole("button", { name: "进入控制台" }));

    expect(screen.getByText("请输入有效的邮箱地址")).toBeInTheDocument();
    expect(screen.queryByText("Invalid email address")).not.toBeInTheDocument();
  });

  it.each([
    ["/audits?environment=staging", "/audits?environment=staging"],
    ["//outside.example/audits", "/overview"],
    ["/\\outside.example/audits", "/overview"],
    ["https://outside.example/audits", "/overview"],
    ["///[", "/overview"],
  ])("redirects a successful login from %s to %s", async (from, expected) => {
    const user = userEvent.setup();
    window.history.replaceState(
      {},
      "",
      `/login?from=${encodeURIComponent(from)}`,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );

    render(
      <NextIntlClientProvider locale="zh-CN" messages={messages}>
        <LoginPage />
      </NextIntlClientProvider>,
    );

    await user.type(screen.getByLabelText("邮箱"), "qa@controlhub.local");
    await user.type(screen.getByLabelText("密码"), "secret");
    await user.click(screen.getByRole("button", { name: "进入控制台" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(expected));
  });
});
