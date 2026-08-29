// input: Vitest, ingestion service, and API client mock
// output: ingestion service coverage
// pos: ingestion service tests
// note: update this header and README.md.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/services/api-client";
import { confirmIngestion, getIngestionPreview, previewIngestion } from "@/services/resources";

const { apiClientMock } = vi.hoisted(() => ({ apiClientMock: vi.fn() }));

vi.mock("@/services/api-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/services/api-client")>(),
  apiClient: apiClientMock,
}));

describe("ingestion service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    apiClientMock.mockResolvedValue({ confirmable: true, fingerprint: "a".repeat(64), rows: [] });
  });

  it("sends the exact reviewed file, selected format, and server fingerprint as multipart", async () => {
    const file = new File(["[]"], "inventory.json", { type: "application/json" });
    const fingerprint = "a".repeat(64);

    await previewIngestion(file, "json");
    await confirmIngestion(file, "json", fingerprint);

    const [previewPath, previewInit] = apiClientMock.mock.calls[0] as [string, RequestInit];
    expect(previewPath).toBe("/admin/ingestions/preview");
    expect(previewInit.method).toBe("POST");
    expect(Array.from((previewInit.body as FormData).entries())).toEqual([
      ["format", "json"],
      ["file", file],
    ]);

    const [confirmPath, confirmInit] = apiClientMock.mock.calls[1] as [string, RequestInit];
    expect(confirmPath).toBe("/admin/ingestions/confirm");
    expect(Array.from((confirmInit.body as FormData).entries())).toEqual([
      ["format", "json"],
      ["file", file],
      ["fingerprint", fingerprint],
    ]);
  });

  it.each(["ingestion_conflict", "ingestion_preview_stale"])("extracts the fresh preview from %s 409 responses", (code) => {
    const preview = { confirmable: false, fingerprint: "b".repeat(64), rows: [] };

    expect(getIngestionPreview(new ApiError(409, "review required", undefined, code, { preview }))).toEqual(preview);
  });
});
