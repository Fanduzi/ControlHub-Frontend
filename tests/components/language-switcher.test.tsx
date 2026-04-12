import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LanguageSwitcher } from "@/components/settings/language-switcher";
import messages from "@/messages/en.json";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/",
}));

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    refresh.mockClear();
    document.cookie =
      "controlhub.locale=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("renders direct Chinese and English switch buttons", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LanguageSwitcher />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("button", { name: "中" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EN" })).toBeInTheDocument();
  });

  it("persists the locale cookie and refreshes after selecting Chinese", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LanguageSwitcher />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "中" }));

    expect(document.cookie).toContain("controlhub.locale=zh-CN");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
