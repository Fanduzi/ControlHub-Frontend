// input: Vitest, resource ingestion service, mocked shared API client, and File/FormData
// output: exact preview/confirm multipart request-shape coverage
// pos: service seam tests for server-owned ingestion parsing and fingerprint binding
// note: if this file changes, update this header and module README.md.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { confirmIngestion, previewIngestion } from "@/services/resources";

const { apiClientMock } = vi.hoisted(() => ({ apiClientMock: vi.fn() }));

vi.mock("@/services/api-client", () => ({ apiClient: apiClientMock }));

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
});
