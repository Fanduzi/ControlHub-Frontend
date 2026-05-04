import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const keys: Record<string, string> = {
  "summary": "{eventType} completed with {result} result.",
  "emptyTitle": "No audit activity yet",
  "emptyDescription": "Recent resource changes will appear here once the backend audit feed is connected.",
  "eventTypes.resource_updated": "Resource updated",
  "results.success": "success",
};

function t(key: string) {
  return keys[key] ?? key;
}

(t as unknown as { has: (key: string) => boolean }).has = (key: string) => key in keys;

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => t,
}));

describe("ActivityTimeline", () => {
  it("uses localized default empty state when no events", async () => {
    const { ActivityTimeline } = await import(
      "@/components/blocks/activity-timeline"
    );

    render(<ActivityTimeline events={[]} />);

    expect(screen.getByText("No audit activity yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Recent resource changes will appear here once the backend audit feed is connected.",
      ),
    ).toBeInTheDocument();
  });

  it("allows caller to override empty state", async () => {
    const { ActivityTimeline } = await import(
      "@/components/blocks/activity-timeline"
    );

    render(
      <ActivityTimeline
        events={[]}
        emptyTitle="Custom title"
        emptyDescription="Custom description"
      />,
    );

    expect(screen.getByText("Custom title")).toBeInTheDocument();
    expect(screen.getByText("Custom description")).toBeInTheDocument();
  });

  it("renders events when provided", async () => {
    const { ActivityTimeline } = await import(
      "@/components/blocks/activity-timeline"
    );

    render(
      <ActivityTimeline
        events={[
          {
            id: 1,
            actorUserId: 1,
            targetResourceId: 14,
            eventType: "resource.updated",
            result: "success",
            createdAt: "2026-04-28T12:00:00Z",
            actorLabel: "admin",
            targetResourceName: "Test",
            environmentLabel: "Prod",
            summary: "Update.",
          },
        ]}
      />,
    );

    expect(screen.getByText("Resource updated")).toBeInTheDocument();
    expect(screen.queryByText("No audit activity yet")).not.toBeInTheDocument();
  });
});
