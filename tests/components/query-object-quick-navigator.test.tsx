import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/query" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => ({ title: "Quick navigator", search: "Search databases and objects", retry: "Retry", insert: "Insert" })[key] ?? key }));
vi.mock("@/services/query-schema", () => ({
  getSchemaDatabases: vi.fn().mockResolvedValue({ items: [] }),
  getSchemaObjects: vi.fn().mockResolvedValue({ items: [] }),
}));

import { QueryObjectQuickNavigator } from "@/components/query/query-object-quick-navigator";

describe("QueryObjectQuickNavigator", () => {
  it("opens with Cmd+P and prevents browser print", () => {
    const preventDefault = vi.fn();
    render(<QueryObjectQuickNavigator targetId={1} activeDatabase={null} onDatabaseSelect={vi.fn()} onInsertObject={vi.fn()} />);
    act(() => { fireEvent.keyDown(window, { key: "p", metaKey: true, preventDefault }); });
    expect(screen.getByRole("dialog", { name: "Quick navigator" })).toBeInTheDocument();
  });
});
