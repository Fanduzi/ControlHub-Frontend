// input: Vitest, Testing Library, and ingestion dialog
// output: ingestion dialog coverage
// pos: ingestion dialog component tests
// note: update this header and README.md.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IngestionDialog } from "@/components/resources/ingestion-dialog";
import { ApiError } from "@/services/api-client";
import messages from "@/messages/en.json";
import zhMessages from "@/messages/zh-CN.json";

const { confirmIngestionMock, previewIngestionMock } = vi.hoisted(() => ({
  confirmIngestionMock: vi.fn(),
  previewIngestionMock: vi.fn(),
}));

vi.mock("@/services/resources", () => ({
  confirmIngestion: confirmIngestionMock,
  getIngestionPreview: (error: { body?: { preview?: unknown } }) => error.body?.preview,
  previewIngestion: previewIngestionMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const fingerprint = "a".repeat(64);
const confirmablePreview = {
  confirmable: true,
  fingerprint,
  rows: [
    {
      row: 1,
      action: "create",
      diff: { fields: {}, profile: {}, observed: {}, relations: { added: [], removed: [] } },
    },
    {
      row: 2,
      action: "update",
      matchedId: 42,
      diff: {
        fields: { displayName: { before: "Old service", after: "New service" } },
        profile: { version: { before: "1", after: "2" } },
        observed: {},
        relations: { added: [{ type: "runs_on", targetId: 7 }], removed: [] },
      },
    },
  ],
};

function renderDialog(locale = "en", localeMessages = messages) {
  return render(
    <NextIntlClientProvider locale={locale} messages={localeMessages}>
      <IngestionDialog open onOpenChange={() => undefined} />
    </NextIntlClientProvider>,
  );
}

async function preview(file = new File(["[]"], "inventory.json", { type: "application/json" }), locale = "en", localeMessages = messages) {
  const user = userEvent.setup();
  renderDialog(locale, localeMessages);
  await user.upload(screen.getByLabelText(locale === "en" ? "Ingestion file" : "导入文件"), file);
  await user.click(screen.getByRole("button", { name: locale === "en" ? "Preview" : "预览" }));
  return { file, user };
}

describe("IngestionDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lets an admin review server-classified rows and confirm the exact reviewed upload", async () => {
    previewIngestionMock.mockResolvedValue(confirmablePreview);
    confirmIngestionMock.mockResolvedValue(confirmablePreview);

    const { file, user } = await preview();

    expect(await screen.findByText("Create")).toBeInTheDocument();
    expect(screen.getByText("Update")).toBeInTheDocument();
    expect(screen.getByText("displayName: Old service → New service")).toBeInTheDocument();
    expect(screen.getByText("runs_on → #7")).toBeInTheDocument();
    expect(previewIngestionMock).toHaveBeenCalledWith(file, "json");

    await user.click(screen.getByRole("button", { name: "Confirm import" }));

    await waitFor(() => {
      expect(confirmIngestionMock).toHaveBeenCalledWith(file, "json", fingerprint);
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Ingestion confirmed");
    expect(screen.getByRole("status")).toHaveTextContent("1 created · 1 updated · 0 conflicts");
  });

  it.each([400, 413])("shows the controlled malformed or oversize upload error (%i)", async (status) => {
    previewIngestionMock.mockRejectedValue(new ApiError(status, "invalid ingestion", undefined, "validation_failed"));

    await preview();

    expect(await screen.findByText("The upload is invalid or too large. Correct it and preview again.")).toBeInTheDocument();
  });

  it("shows server conflict explanations and never enables partial confirmation", async () => {
    previewIngestionMock.mockResolvedValue({
      confirmable: false,
      fingerprint,
      rows: [{
        row: 1,
        action: "conflict",
        conflict: "Alias matches two resources.",
        diff: { fields: {}, profile: {}, observed: {}, relations: { added: [], removed: [] } },
      }],
    });

    await preview();

    expect(await screen.findByText("Alias matches two resources.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
  });

  it("localizes summary counts", async () => {
    previewIngestionMock.mockResolvedValue(confirmablePreview);

    await preview(undefined, "zh-CN", zhMessages);

    expect(await screen.findByText("新建 1 项 · 更新 1 项 · 冲突 0 项")).toBeInTheDocument();
  });

  it.each(["ingestion_conflict", "ingestion_preview_stale"])("replaces the reviewed preview with the fresh 409 %s preview", async (code) => {
    previewIngestionMock.mockResolvedValue(confirmablePreview);
    confirmIngestionMock.mockRejectedValue(new ApiError(409, "review the returned preview", undefined, code, {
      preview: {
        confirmable: false,
        fingerprint: "b".repeat(64),
        rows: [{
          row: 1,
          action: "conflict",
          conflict: "Returned fresh conflict.",
          diff: { fields: {}, profile: {}, observed: {}, relations: { added: [], removed: [] } },
        }],
      },
    }));

    const { user } = await preview();
    await user.click(screen.getByRole("button", { name: "Confirm import" }));

    expect(await screen.findByText("Returned fresh conflict.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeDisabled();
    expect(confirmIngestionMock).toHaveBeenCalledTimes(1);
  });
});
