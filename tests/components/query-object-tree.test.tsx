import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { QueryObjectTree, type ObjectListingState } from "@/components/query/query-object-tree";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh-CN.json";
import type { ObjectSummary } from "@/types/query-schema";

function listing(partial: Partial<ObjectListingState> & Pick<ObjectListingState, "items">): ObjectListingState {
  return {
    draftQuery: "",
    submittedQuery: "",
    pageInfo: null,
    status: "ready",
    generation: 1,
    ...partial,
  };
}

function renderTree(
  props: Partial<React.ComponentProps<typeof QueryObjectTree>> & {
    locale?: "en" | "zh-CN";
  } = {},
) {
  const { locale = "en", ...treeProps } = props;
  const messages = locale === "zh-CN" ? zhMessages : enMessages;
  const databases = treeProps.databases ?? ["db1", "db2"];
  const objects: ObjectSummary[] = [
    { database: "db1", name: "t1", kind: "table" },
    { database: "db2", name: "t2", kind: "table" },
  ];
  const objectListings = new Map<string, ObjectListingState>([
    [
      "db1",
      listing({
        items: [objects[0]!],
        pageInfo: {
          page: 1,
          pageSize: 25,
          totalItems: 30,
          totalPages: 2,
          hasNextPage: true,
          hasPreviousPage: false,
        },
        status: "error",
      }),
    ],
    [
      "db2",
      listing({
        items: [objects[1]!],
        pageInfo: {
          page: 1,
          pageSize: 25,
          totalItems: 30,
          totalPages: 2,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      }),
    ],
  ]);

  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryObjectTree
        databases={databases}
        expandedDatabases={new Set(databases)}
        expandedObjects={new Set()}
        objectsByDatabase={new Map(databases.map((database) => [database, objectListings.get(database)?.items ?? []]))}
        loadingDatabases={new Set()}
        loadingObjects={new Set()}
        onDatabaseToggle={vi.fn()}
        onObjectToggle={vi.fn()}
        renderDetail={() => null}
        objectListings={objectListings}
        onSearch={vi.fn()}
        onClearSearch={vi.fn()}
        onLoadMoreObjects={vi.fn()}
        onRetryObjects={vi.fn()}
        onDraftQueryChange={vi.fn()}
        {...treeProps}
      />
    </NextIntlClientProvider>,
  );
}

describe("QueryObjectTree accessibility structure", () => {
  function databaseTreeitem(database: string): HTMLElement {
    const button = screen.getAllByRole("button").find((element) => element.textContent?.trim() === database);
    if (!button) {
      throw new Error(`Missing database button ${database}`);
    }
    const item = button.closest('[role="treeitem"]');
    if (!(item instanceof HTMLElement)) {
      throw new Error(`Missing treeitem for database ${database}`);
    }
    return item;
  }

  it("P2-3: database treeitem owns object group; controls are outside every treeitem", () => {
    renderTree({ databases: ["db1"] });

    const tree = screen.getByRole("tree");
    const dbItem = databaseTreeitem("db1");
    expect(tree.contains(dbItem)).toBe(true);
    expect(dbItem).toHaveAttribute("aria-expanded", "true");

    const ownedId = dbItem.getAttribute("aria-owns");
    expect(ownedId).toBeTruthy();
    const ownedGroup = document.getElementById(ownedId!);
    expect(ownedGroup).not.toBeNull();
    expect(ownedGroup).toHaveAttribute("role", "group");
    expect(within(ownedGroup!).getByRole("treeitem", { name: "t1" })).toBeVisible();
    expect(ownedGroup!.contains(within(tree).getByRole("treeitem", { name: "t1" }))).toBe(true);
    expect(dbItem.contains(ownedGroup!)).toBe(false);

    const search = screen.getByRole("textbox", { name: /search objects in db1/i });
    const loadMore = screen.getByRole("button", { name: /load more objects in db1/i });
    const retry = screen.getByRole("button", { name: /retry loading objects in db1/i });

    for (const treeitem of within(tree).getAllByRole("treeitem")) {
      expect(treeitem).not.toContainElement(search);
      expect(treeitem).not.toContainElement(loadMore);
      expect(treeitem).not.toContainElement(retry);
    }

    expect(ownedGroup!.contains(search)).toBe(false);
    expect(ownedGroup!.contains(loadMore)).toBe(false);
    expect(ownedGroup!.contains(retry)).toBe(false);
  });

  it("P2-3: multi-database expansion keeps separate ownership without cross-containment", () => {
    renderTree({ databases: ["db1", "db2"] });

    const tree = screen.getByRole("tree");
    const db1 = databaseTreeitem("db1");
    const db2 = databaseTreeitem("db2");
    const group1 = document.getElementById(db1.getAttribute("aria-owns")!);
    const group2 = document.getElementById(db2.getAttribute("aria-owns")!);
    expect(group1).not.toBeNull();
    expect(group2).not.toBeNull();
    expect(group1).not.toBe(group2);

    expect(within(group1!).getByRole("treeitem", { name: "t1" })).toBeVisible();
    expect(within(group2!).getByRole("treeitem", { name: "t2" })).toBeVisible();
    expect(group1!.contains(within(tree).getByRole("treeitem", { name: "t2" }))).toBe(false);
    expect(group2!.contains(within(tree).getByRole("treeitem", { name: "t1" }))).toBe(false);
  });

  it("P3-2: EN control accessible names include database", () => {
    renderTree({ locale: "en", databases: ["db1"] });
    expect(screen.getByRole("textbox", { name: /search objects in db1/i })).toBeVisible();
    expect(screen.getByRole("button", { name: "Load more objects in db1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry loading objects in db1" })).toBeVisible();
  });

  it("P3-2: ZH control accessible names include database", () => {
    renderTree({ locale: "zh-CN", databases: ["db1"] });
    expect(screen.getByRole("textbox", { name: /搜索 db1 中的对象/i })).toBeVisible();
    expect(screen.getByRole("button", { name: "加载更多 db1 中的对象" })).toBeVisible();
    expect(screen.getByRole("button", { name: "重试加载 db1 中的对象" })).toBeVisible();
  });

  it("search input is full-width and accessible at narrow widths", () => {
    renderTree({ databases: ["db1"] });
    const input = screen.getByRole("textbox", { name: /search objects in db1/i });
    expect(input).toBeVisible();
    expect(input.className).toContain("w-full");
  });

  it("P2-3: search controls remain outside every treeitem", () => {
    renderTree({ databases: ["db1"] });
    const tree = screen.getByRole("tree");
    const search = screen.getByRole("textbox", { name: /search objects in db1/i });

    for (const treeitem of within(tree).getAllByRole("treeitem")) {
      expect(treeitem).not.toContainElement(search);
    }
  });
});

describe("Phase 38S: search intent forwarding in QueryObjectTree", () => {
  it("forwards each draft change immediately so the explorer owns debouncing", () => {
    const onSearch = vi.fn();
    const onDraftQueryChange = vi.fn();
    renderTree({ databases: ["db1"], onSearch, onDraftQueryChange });

    const searchInput = screen.getByRole("textbox", { name: /search objects in db1/i });
    fireEvent.change(searchInput, { target: { value: "orders" } });

    expect(onDraftQueryChange).toHaveBeenCalledWith("db1", "orders");
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("db1", "orders");
  });

  it("clear button delegates unfiltered search to the explorer", async () => {
    const onClearSearch = vi.fn();
    renderTree({
      databases: ["db1"],
      onClearSearch,
      objectListings: new Map([["db1", listing({ draftQuery: "test", items: [] })]]),
    });

    const clearButton = screen.getByRole("button", { name: /clear search in db1/i });
    fireEvent.click(clearButton);

    expect(onClearSearch).toHaveBeenCalledWith("db1");
  });

  it("EN accessible name for search input includes database name", () => {
    renderTree({ locale: "en", databases: ["my_db"] });
    expect(screen.getByRole("textbox", { name: /search objects in my_db/i })).toBeInTheDocument();
  });

  it("zh-CN accessible name for search input includes database name", () => {
    renderTree({ locale: "zh-CN", databases: ["my_db"] });
    expect(screen.getByRole("textbox", { name: /搜索 my_db 中的对象/i })).toBeInTheDocument();
  });

  it("search controls are outside every treeitem role", () => {
    renderTree({ databases: ["db1"] });
    const tree = screen.getByRole("tree");
    const searchInput = screen.getByRole("textbox", { name: /search objects in db1/i });

    for (const treeitem of within(tree).getAllByRole("treeitem")) {
      expect(treeitem).not.toContainElement(searchInput);
    }
  });
});
