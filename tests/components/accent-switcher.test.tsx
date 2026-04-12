import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AccentProvider } from "@/components/providers/accent-provider";
import { AccentSwitcher } from "@/components/settings/accent-switcher";
import messages from "@/messages/en.json";

describe("AccentSwitcher", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.accent;
  });

  it("applies a purple accent to the document root", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AccentProvider>
          <AccentSwitcher />
        </AccentProvider>
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Accent color" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Purple" }));

    expect(document.documentElement.dataset.accent).toBe("purple");
  });
});
