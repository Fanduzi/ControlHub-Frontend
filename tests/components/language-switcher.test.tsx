import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LanguageSwitcher } from "@/components/settings/language-switcher";
import messages from "@/messages/en.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/",
}));

describe("LanguageSwitcher", () => {
  it("renders and opens to show language options", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LanguageSwitcher />
      </NextIntlClientProvider>,
    );

    const combobox = screen.getByRole("combobox", { name: "Language" });
    expect(combobox).toBeInTheDocument();

    await user.click(combobox);

    expect(screen.getByText("Chinese")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
  });
});
