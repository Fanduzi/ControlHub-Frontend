import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useClickHouseWorksheetCatalog } from "@/lib/use-clickhouse-worksheet-catalog";
import { apiClient } from "@/services/api-client";

vi.mock("@/services/api-client", () => ({ apiClient: vi.fn() }));
afterEach(() => vi.resetAllMocks());
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function catalog(generation: string, name: string) {
  return {
    generation,
    tables: [
      { name, columns: ["visible"], worksheet: true },
      { name: "preview_only", columns: ["secret"] },
    ],
  };
}

it("drops old names immediately on target or generation changes and ignores late responses", async () => {
  const old = deferred(),
    next = deferred(),
    wrong = deferred();
  vi.mocked(apiClient)
    .mockResolvedValueOnce(catalog("A", "first"))
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(next.promise)
    .mockReturnValueOnce(wrong.promise);
  const { result, rerender } = renderHook(
    ({ target, generation }) =>
      useClickHouseWorksheetCatalog(target, generation),
    { initialProps: { target: 1, generation: "A" } },
  );
  await waitFor(() =>
    expect(result.current?.namespace?.tables.map((t) => t.name)).toEqual([
      "first",
    ]),
  );
  expect(result.current?.namespace?.loadedColumns).toEqual({
    first: ["visible"],
  });
  rerender({ target: 1, generation: "B" });
  expect(result.current).toBeUndefined();
  rerender({ target: 2, generation: "B" });
  expect(result.current).toBeUndefined();
  await act(async () => next.resolve(catalog("B", "second")));
  await act(async () => old.resolve(catalog("B", "late_first")));
  expect(result.current?.namespace?.tables.map((t) => t.name)).toEqual([
    "second",
  ]);
  expect(vi.mocked(apiClient).mock.calls[1][1]?.signal?.aborted).toBe(true);
  rerender({ target: 2, generation: "C" });
  expect(result.current).toBeUndefined();
  await act(async () => wrong.resolve(catalog("B", "stale")));
  expect(result.current?.namespace).toBeUndefined();
});

it("does not request metadata without worksheet approval and fails closed on a denied catalog", async () => {
  vi.mocked(apiClient).mockRejectedValueOnce(new Error("denied"));
  const { result, rerender } = renderHook(
    ({ generation }: { generation?: string }) =>
      useClickHouseWorksheetCatalog(1, generation),
    { initialProps: { generation: undefined } as { generation?: string } },
  );
  expect(apiClient).not.toHaveBeenCalled();
  rerender({ generation: "A" });
  await waitFor(() => expect(result.current?.identity.generation).toBe("A"));
  expect(result.current?.namespace).toBeUndefined();
});
