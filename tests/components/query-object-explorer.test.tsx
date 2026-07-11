import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/query-schema", () => ({
  getObjectDetails: vi.fn(),
  getSchemaDatabases: vi.fn(),
  getSchemaObjects: vi.fn(),
}));

import { QuerySchemaBrowser } from "@/components/query/query-schema-browser";
import { QuerySchemaStore } from "@/lib/query-schema-store";
import { getSchemaDatabases } from "@/services/query-schema";
import { buildQueryTarget } from "@/tests/fixtures/query-targets";
import enMessages from "@/messages/en.json";

const mockGetSchemaDatabases = vi.mocked(getSchemaDatabases);

function renderBrowser() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <QuerySchemaBrowser
        store={new QuerySchemaStore()}
        target={buildQueryTarget({
          resourceId: 12,
          capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
        })}
      />
    </NextIntlClientProvider>,
  );
}

describe("QuerySchemaBrowser", () => {
  beforeEach(() => {
    mockGetSchemaDatabases.mockReset();
  });

  it("fetches only the first bounded database page when the explorer opens", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 12,
      defaultDatabase: "app",
      items: [{ name: "app", isDefault: true }],
      pageInfo: {
        page: 1,
        pageSize: 25,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    renderBrowser();

    await user.click(screen.getByRole("button", { name: "Open objects" }));

    await waitFor(() => {
      expect(mockGetSchemaDatabases).toHaveBeenCalledWith(
        12,
        expect.objectContaining({ page: 1, pageSize: 25 }),
      );
    });
    expect(mockGetSchemaDatabases).toHaveBeenCalledTimes(1);
  });
});
