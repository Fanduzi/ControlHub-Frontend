import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EnvironmentProvider,
  useEnvironment,
} from "@/components/providers/environment-provider";
import { listEnvironments } from "@/services/settings";

vi.mock("@/services/settings", () => ({
  listEnvironments: vi.fn(),
}));

const mockedListEnvironments = vi.mocked(listEnvironments);

function EnvironmentIds() {
  const { environments } = useEnvironment();

  return <div>{environments.map((environment) => environment.id).join(",")}</div>;
}

describe("EnvironmentProvider", () => {
  beforeEach(() => {
    mockedListEnvironments.mockReset();
    window.localStorage.clear();
  });

  it("does not expose environment slug fallbacks before backend environments load", async () => {
    mockedListEnvironments.mockResolvedValue([
      {
        id: "10000000-0000-0000-0000-000000000001",
        name: "Production",
        slug: "prod",
        description: "Production environment",
        createdAt: "2026-04-12T12:57:30Z",
      },
    ]);

    render(
      <EnvironmentProvider>
        <EnvironmentIds />
      </EnvironmentProvider>,
    );

    expect(screen.queryByText(/production/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText("10000000-0000-0000-0000-000000000001"),
      ).toBeInTheDocument();
    });
  });
});
