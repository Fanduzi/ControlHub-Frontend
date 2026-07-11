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
import { getSchemaDatabases, getSchemaObjects } from "@/services/query-schema";
import { buildQueryTarget } from "@/tests/fixtures/query-targets";
import enMessages from "@/messages/en.json";

const mockGetSchemaDatabases = vi.mocked(getSchemaDatabases);
const mockGetSchemaObjects = vi.mocked(getSchemaObjects);

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
    mockGetSchemaObjects.mockReset();
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

  it("keeps a 1000-object namespace lazy until its database is expanded", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 12,
      defaultDatabase: "app",
      items: Array.from({ length: 25 }, (_, index) => ({ name: `database_${index}`, isDefault: index === 0 })),
      pageInfo: { page: 1, pageSize: 25, totalItems: 1000, totalPages: 40, hasNextPage: true, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 12,
      database: "database_0",
      items: Array.from({ length: 500 }, (_, index) => ({ database: "database_0", name: `object_${index}`, kind: "table" as const })),
      pageInfo: { page: 1, pageSize: 25, totalItems: 1000, totalPages: 40, hasNextPage: true, hasPreviousPage: false },
    });

    renderBrowser();
    await user.click(screen.getByRole("button", { name: "Open objects" }));
    await screen.findByRole("button", { name: "database_0" });

    expect(mockGetSchemaDatabases).toHaveBeenCalledTimes(1);
    expect(mockGetSchemaObjects).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "database_0" }));
    await waitFor(() => expect(mockGetSchemaObjects).toHaveBeenCalledTimes(1));
    expect(mockGetSchemaObjects).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ database: "database_0", page: 1, pageSize: 25 }),
    );
  });
});
