// input: vitest, testing-library, environment-provider
// output: tests for the authenticated BFF environments probe without browser role state
// pos: component unit tests
// note: if this file changes, update header and tests/components/README.md
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function EnvironmentSelector() {
  const { setEnvironmentId } = useEnvironment();

  return <button onClick={() => setEnvironmentId(2)}>Use staging</button>;
}

describe("EnvironmentProvider", () => {
  beforeEach(() => {
    mockedListEnvironments.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = "controlhub.role=; path=/; max-age=0";
  });

  it("loads environments through the authenticated BFF path without browser role state", async () => {
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

  it("fails closed when the authenticated BFF environments request is rejected", async () => {
    mockedListEnvironments.mockRejectedValue(new Error("unauthorized"));
    render(
      <EnvironmentProvider>
        <EnvironmentIds />
      </EnvironmentProvider>,
    );

    await waitFor(() => expect(mockedListEnvironments).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("does not duplicate the authenticated environments request", async () => {
    mockedListEnvironments.mockResolvedValue([
      {
        id: 2,
        name: "Staging",
        slug: "staging",
        description: "Staging",
        createdAt: "2026-04-12T12:57:30Z",
      },
    ]);

    render(
      <EnvironmentProvider>
        <EnvironmentIds />
      </EnvironmentProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("2")).toBeInTheDocument();
    });
    expect(mockedListEnvironments).toHaveBeenCalledTimes(1);
  });

  it("persists an environment selection without its own route refresh", async () => {
    mockedListEnvironments.mockResolvedValue([]);

    render(
      <EnvironmentProvider>
        <EnvironmentSelector />
      </EnvironmentProvider>,
    );

    await waitFor(() => {
      expect(mockedListEnvironments).toHaveBeenCalledOnce();
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Use staging" }));
    });

    expect(window.localStorage.getItem("controlhub.environmentId")).toBe("2");
  });
});
