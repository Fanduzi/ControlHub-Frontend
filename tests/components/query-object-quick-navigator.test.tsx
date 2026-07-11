import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/query" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => ({ title: "Quick navigator", search: "Search databases and objects", retry: "Retry", insert: "Insert" })[key] ?? key }));
vi.mock("@/services/query-schema", () => ({
  getSchemaDatabases: vi.fn().mockResolvedValue({ items: [] }),
  getSchemaObjects: vi.fn().mockResolvedValue({ items: [] }),
}));

import { QueryObjectQuickNavigator } from "@/components/query/query-object-quick-navigator";
import { getSchemaDatabases, getSchemaObjects } from "@/services/query-schema";

const mockGetSchemaDatabases = vi.mocked(getSchemaDatabases);
const mockGetSchemaObjects = vi.mocked(getSchemaObjects);

describe("QueryObjectQuickNavigator", () => {
  it("opens with Cmd+P and prevents browser print", () => {
    const preventDefault = vi.fn();
    render(<QueryObjectQuickNavigator targetId={1} activeDatabase={null} onDatabaseSelect={vi.fn()} onInsertObject={vi.fn()} />);
    act(() => { fireEvent.keyDown(window, { key: "p", metaKey: true, preventDefault }); });
    expect(screen.getByRole("dialog", { name: "Quick navigator" })).toBeInTheDocument();
  });

  it("uses arrow keys and Enter to reveal the active object without inserting SQL", async () => {
    const onInsertObject = vi.fn();
    const onRevealObject = vi.fn();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1,
      defaultDatabase: "app",
      items: [{ name: "app", isDefault: true }],
      pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 1,
      database: "app",
      items: [{ database: "app", name: "orders", kind: "table" }],
      pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    render(<QueryObjectQuickNavigator targetId={1} activeDatabase="app" onDatabaseSelect={vi.fn()} onRevealObject={onRevealObject} onInsertObject={onInsertObject} />);

    act(() => { fireEvent.keyDown(window, { key: "p", ctrlKey: true }); });
    const search = await screen.findByRole("textbox", { name: "Search databases and objects" });
    await waitFor(() => expect(mockGetSchemaObjects).toHaveBeenCalledWith(1, expect.objectContaining({ database: "app", page: 1, pageSize: 50 })));

    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(onRevealObject).toHaveBeenCalledWith(expect.objectContaining({ name: "orders" }));
    expect(onInsertObject).not.toHaveBeenCalled();
  });

  it("closes on Escape and sends only bounded, credential-free metadata requests", async () => {
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1,
      defaultDatabase: "",
      items: [],
      pageInfo: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });
    render(<QueryObjectQuickNavigator targetId={1} activeDatabase={null} onDatabaseSelect={vi.fn()} onInsertObject={vi.fn()} />);

    act(() => { fireEvent.keyDown(window, { key: "p", metaKey: true }); });
    await screen.findByRole("dialog", { name: "Quick navigator" });
    const [targetId, params] = mockGetSchemaDatabases.mock.calls[0] ?? [];
    expect(targetId).toBe(1);
    expect(params).toEqual(expect.objectContaining({ page: 1, pageSize: 50 }));
    expect(JSON.stringify(params)).not.toMatch(/credential|password|username|dsn/i);

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search databases and objects" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Quick navigator" })).toBeNull();
  });
});
