// input: vitest, testing-library, environment-provider
// output: tests for legacy-credential gate on environments probe
// pos: component unit tests
// note: if this file changes, update header and tests/components/README.md
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
    window.sessionStorage.clear();
    document.cookie = "controlhub.token=; path=/; max-age=0";
  });

  it("does not expose environment slug fallbacks before backend environments load", async () => {
    window.sessionStorage.setItem("controlhub.token", "legacy-token");
    mockedListEnvironments.mockResolvedValue([
      {
        id: 1,
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
        screen.getByText("1"),
      ).toBeInTheDocument();
    });
  });

  it("skips the environments probe when no legacy browser credential exists", async () => {
    render(
      <EnvironmentProvider>
        <EnvironmentIds />
      </EnvironmentProvider>,
    );

    await waitFor(() => {
      expect(mockedListEnvironments).not.toHaveBeenCalled();
    });
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });
});
