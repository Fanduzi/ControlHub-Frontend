// input: rendered relation panel, auth-role boundary, service mocks, and English/Chinese locale messages
// output: public UI contract for localized directions, source-path mutations, resilient row removal, and controlled errors
// pos: relation-panel rendered seam for role gates, candidates, accessibility, taxonomy rules, and controlled errors
// note: if this file changes, update this header and tests/components/README.md.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResourceRelationPanel } from "@/components/blocks/resource-relation-panel";
import { ApiError } from "@/services/api-client";
import * as relationService from "@/services/resources";
import * as settingsService from "@/services/settings";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh-CN.json";
import type { ResourceRelationViewModel } from "@/types/view-models";

const messages = enMessages;

let isAdmin = true;
let selectedResources: Array<{
  id: number;
  displayName: string;
  resourceType: string;
  environmentId: number;
}> = [];
vi.mock("@/lib/auth-role", () => ({
  useAdminRole: () => isAdmin,
}));

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/services/resources", () => ({
  createResourceRelation: vi.fn(),
  deleteResourceRelation: vi.fn(),
  getResourceRelationRules: vi.fn(),
}));

vi.mock("@/services/settings", () => ({
  listRelationTypes: vi.fn(),
}));

const mockedCreateRelation = vi.mocked(relationService.createResourceRelation);
const mockedDeleteRelation = vi.mocked(relationService.deleteResourceRelation);
const mockedGetRelationRules = vi.mocked(relationService.getResourceRelationRules);
const mockedListRelationTypes = vi.mocked(settingsService.listRelationTypes);

vi.mock("@/components/blocks/resource-search-combobox", () => ({
  ResourceSearchCombobox: ({
    onSelect,
    excludeIds,
    resourceTypes,
    environmentId,
    disabled,
  }: {
    onSelect: (resource: {
      id: number;
      displayName: string;
      resourceType: string;
      environmentId: number;
    }) => void;
    excludeIds?: number[];
    resourceTypes?: string[];
    environmentId?: number;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      data-testid="resource-search-combobox"
      data-exclude-ids={excludeIds?.join(",") ?? ""}
	  data-resource-types={resourceTypes?.join(",") ?? ""}
      data-environment-id={environmentId ?? ""}
	  disabled={disabled}
      onClick={() => {
        onSelect(selectedResources.shift() ?? {
          id: 9,
          displayName: "orders-replica",
          resourceType: resourceTypes?.[0] ?? "database_instance",
          environmentId: environmentId ?? 1,
        });
      }}
    >
      pick resource
    </button>
  ),
}));

const relations: ResourceRelationViewModel[] = [
  {
    id: 1,
    fromResourceId: 1,
    toResourceId: 2,
    relationType: "member_of",
    createdAt: "2026-04-11T13:00:00Z",
    relatedResourceId: 2,
    relatedResourceName: "orders-cluster",
    direction: "outgoing",
    relatedResource: {
      id: 2,
      displayName: "orders-cluster",
      resourceType: "database_cluster",
      healthStatus: "healthy",
    },
  },
];

const relationsInBothDirections: ResourceRelationViewModel[] = [
  ...relations,
  {
    ...relations[0],
    id: 2,
    relationType: "fronts",
    direction: "incoming",
    relatedResourceId: 3,
    relatedResourceName: "orders-proxy",
    relatedResource: {
      id: 3,
      displayName: "orders-proxy",
      resourceType: "database_proxy",
      healthStatus: "healthy",
    },
  },
];

describe("ResourceRelationPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    refresh.mockClear();
    isAdmin = true;
    selectedResources = [];

    mockedListRelationTypes.mockResolvedValue([
      { key: "member_of", label: "Member of", description: "" },
      { key: "depends_on", label: "Depends on", description: "" },
      { key: "runs_on", label: "Runs on", description: "" },
      { key: "points_to", label: "Points to", description: "" },
      { key: "fronts", label: "Fronts", description: "" },
    ]);
	 mockedGetRelationRules.mockResolvedValue({
	   sourceResourceId: 101,
	   sourceEnvironmentId: 1,
	   rules: [
	     {
	       relationType: "member_of",
	       targetResourceTypes: ["database_cluster"],
	       sameEnvironment: true,
	     },
	     {
	       relationType: "depends_on",
	       targetResourceTypes: ["host", "database_instance"],
	       sameEnvironment: false,
	     },
	   ],
	 });
  });

  it("hides add and delete relation affordances for non-admin operators (server stays authoritative)", async () => {
    isAdmin = false;

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={relations} resourceId={101} />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByText("Add relation")).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove this relation/i })).toBeNull();
    // The read surface stays available to editors.
    expect(screen.getByRole("link", { name: "orders-cluster" })).toBeInTheDocument();
  });

  it("renders relations with linked name, type, and resource type badge", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={relations} />
      </NextIntlClientProvider>,
    );

    // Name is rendered as a link to the resource detail page
    const link = screen.getByRole("link", { name: "orders-cluster" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/resources/2");

    // Relation type and direction are still shown
    expect(screen.getByText(/Member Of/)).toBeInTheDocument();
    expect(screen.getByText(/Outgoing/)).toBeInTheDocument();

    // Resource type badge is shown
    expect(screen.getByText("DB Cluster")).toBeInTheDocument();
  });

  it("shows empty state when no relations and no resourceId", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("No linked resources")).toBeInTheDocument();
    expect(screen.queryByText("Add relation")).not.toBeInTheDocument();
  });

  it("shows add-relation button when resourceId is provided", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={[]} resourceId={1} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Add relation")).toBeInTheDocument();
  });

  it("toggles add-relation form on button click", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={[]} resourceId={1} />
      </NextIntlClientProvider>,
    );

    // Click to open add form
    await user.click(screen.getByText("Add relation"));

    await waitFor(() => {
      expect(screen.getByText("Target resource")).toBeInTheDocument();
      expect(screen.getByText("Relation type")).toBeInTheDocument();
    });

    expect(screen.getByTestId("resource-search-combobox")).toHaveAttribute(
      "data-exclude-ids",
      "1",
    );

    // Button text changes to Cancel
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("uses backend rules to limit relation types and target candidates", async () => {
	const user = userEvent.setup();

	render(
	  <NextIntlClientProvider locale="en" messages={messages}>
		<ResourceRelationPanel relations={[]} resourceId={101} />
	  </NextIntlClientProvider>,
	);

	await user.click(screen.getByText("Add relation"));
	await waitFor(() => expect(mockedGetRelationRules).toHaveBeenCalledWith(101));
	await user.click(screen.getByRole("combobox"));
	expect(await screen.findByText("Member of")).toBeInTheDocument();
	expect(screen.getByText("Depends on")).toBeInTheDocument();
	expect(screen.queryByText("Runs on")).not.toBeInTheDocument();
	await user.click(screen.getByText("Member of"));

	expect(screen.getByTestId("resource-search-combobox")).toHaveAttribute(
	  "data-resource-types",
	  "database_cluster",
	);
	expect(screen.getByTestId("resource-search-combobox")).toHaveAttribute(
	  "data-environment-id",
	  "1",
	);
  });

  it("creates a relation with numeric source and target ids", async () => {
    const user = userEvent.setup();
    mockedCreateRelation.mockResolvedValue({
      id: 10,
      fromResourceId: 1,
      toResourceId: 9,
      relationType: "member_of",
      createdAt: "2026-04-11T14:00:00Z",
    });

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={[]} resourceId={1} />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByText("Add relation"));
	await waitFor(() => expect(mockedGetRelationRules).toHaveBeenCalledWith(1));
    await user.click(screen.getByRole("combobox"));
	await user.click(await screen.findByRole("option", { name: "Member of" }));
	await user.click(screen.getByTestId("resource-search-combobox"));
    await user.click(screen.getByRole("button", { name: "Add relation" }));

    await waitFor(() => {
      expect(mockedCreateRelation).toHaveBeenCalledWith(1, {
        toResourceId: 9,
        relationType: "member_of",
      });
    });

    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ["member_of", "Member of"],
    ["fronts", "Fronts"],
    ["points_to", "Points to"],
  ])("defaults cluster %s relations to incoming and submits from the selected resource", async (relationType, label) => {
    const user = userEvent.setup();
    mockedCreateRelation.mockResolvedValue({
      id: 10,
      fromResourceId: 9,
      toResourceId: 101,
      relationType,
      createdAt: "2026-04-11T14:00:00Z",
    });
    mockedGetRelationRules
      .mockResolvedValueOnce({
        sourceResourceId: 101,
        sourceEnvironmentId: 1,
        rules: [],
      })
      .mockResolvedValueOnce({
        sourceResourceId: 9,
        sourceEnvironmentId: 1,
        rules: [{
          relationType,
          targetResourceTypes: ["database_cluster"],
          sameEnvironment: true,
        }],
      });

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel
          relations={[]}
          resourceId={101}
          resourceType="database_cluster"
          environmentId={1}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByText("Add relation"));
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: label }));
    expect(screen.getByRole("radio", { name: "Selected resource points to this resource" })).toBeChecked();
    await user.click(screen.getByTestId("resource-search-combobox"));

    await waitFor(() => expect(mockedGetRelationRules).toHaveBeenCalledWith(9));
    await user.click(screen.getByRole("button", { name: "Add relation" }));

    expect(mockedCreateRelation).toHaveBeenCalledWith(9, {
      toResourceId: 101,
      relationType,
    });
  });

  it("clears incoming source rules until rules for the replacement source load", async () => {
    const user = userEvent.setup();
    let resolveReplacementRules: (value: Awaited<ReturnType<typeof relationService.getResourceRelationRules>>) => void;
    selectedResources = [
      { id: 9, displayName: "first source", resourceType: "database_instance", environmentId: 1 },
      { id: 10, displayName: "replacement source", resourceType: "database_instance", environmentId: 1 },
    ];
    mockedGetRelationRules
      .mockResolvedValueOnce({ sourceResourceId: 101, sourceEnvironmentId: 1, rules: [] })
      .mockResolvedValueOnce({
        sourceResourceId: 9,
        sourceEnvironmentId: 1,
        rules: [{ relationType: "member_of", targetResourceTypes: ["database_cluster"], sameEnvironment: true }],
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveReplacementRules = resolve;
      }));

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={[]} resourceId={101} resourceType="database_cluster" environmentId={1} />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByText("Add relation"));
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Member of" }));
    await user.click(screen.getByTestId("resource-search-combobox"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add relation" })).toBeEnabled());

    await user.click(screen.getByTestId("resource-search-combobox"));

    expect(screen.getByRole("radio", { name: "Selected resource points to this resource" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Add relation" })).toBeDisabled();

    resolveReplacementRules!({
      sourceResourceId: 10,
      sourceEnvironmentId: 1,
      rules: [{ relationType: "depends_on", targetResourceTypes: ["database_cluster"], sameEnvironment: true }],
    });
    expect(await screen.findByText("The selected relationship is not allowed.")).toBeInTheDocument();
  });

  it("keeps a valid manual direction when the relation type changes", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={[]} resourceId={101} resourceType="database_cluster" environmentId={1} />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByText("Add relation"));
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Member of" }));
    await user.click(screen.getByRole("radio", { name: "This resource points to selected resource" }));
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Fronts" }));

    expect(screen.getByRole("radio", { name: "This resource points to selected resource" })).toBeChecked();
  });

  it("does not submit an incoming relation when the selected source cannot target this resource type", async () => {
    const user = userEvent.setup();
    mockedGetRelationRules
      .mockResolvedValueOnce({
        sourceResourceId: 101,
        sourceEnvironmentId: 1,
        rules: [],
      })
      .mockResolvedValueOnce({
        sourceResourceId: 9,
        sourceEnvironmentId: 1,
        rules: [{
          relationType: "member_of",
          targetResourceTypes: ["host"],
          sameEnvironment: true,
        }],
      });

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel
          relations={[]}
          resourceId={101}
          resourceType="database_cluster"
          environmentId={1}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByText("Add relation"));
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Member of" }));
    await user.click(screen.getByTestId("resource-search-combobox"));

    expect(await screen.findByText("The selected relationship is not allowed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add relation" })).toBeDisabled();
    expect(mockedCreateRelation).not.toHaveBeenCalled();
  });

  it("does not submit an incoming same-environment relation across environments", async () => {
    const user = userEvent.setup();
    mockedGetRelationRules
      .mockResolvedValueOnce({
        sourceResourceId: 101,
        sourceEnvironmentId: 1,
        rules: [],
      })
      .mockResolvedValueOnce({
        sourceResourceId: 9,
        sourceEnvironmentId: 2,
        rules: [{
          relationType: "member_of",
          targetResourceTypes: ["database_cluster"],
          sameEnvironment: true,
        }],
      });

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel
          relations={[]}
          resourceId={101}
          resourceType="database_cluster"
          environmentId={1}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByText("Add relation"));
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Member of" }));
    await user.click(screen.getByTestId("resource-search-combobox"));

    expect(await screen.findByText("The selected relationship is not allowed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add relation" })).toBeDisabled();
  });

  it.each([
    ["en", enMessages, "Direction", "This resource points to selected resource", "Selected resource points to this resource"],
    ["zh-CN", zhMessages, "方向", "此资源指向所选资源", "所选资源指向此资源"],
  ])("exposes the direction choice as an accessible localized group in %s", async (locale, localizedMessages, groupName, outgoing, incoming) => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale={locale} messages={localizedMessages}>
        <ResourceRelationPanel
          relations={[]}
          resourceId={101}
          resourceType="database_cluster"
          environmentId={1}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByText(locale === "en" ? "Add relation" : "添加关系"));

    expect(screen.getByRole("group", { name: groupName })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: outgoing })).toBeChecked();
    expect(screen.getByRole("radio", { name: incoming })).toBeEnabled();
  });

  it("renders a controlled backend matrix rejection", async () => {
    const user = userEvent.setup();
    mockedCreateRelation.mockRejectedValue(
      new ApiError(400, "relation rejected", undefined, "validation_failed"),
    );

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={[]} resourceId={1} />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByText("Add relation"));
    await waitFor(() => expect(mockedGetRelationRules).toHaveBeenCalledWith(1));
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Member of" }));
    await user.click(screen.getByTestId("resource-search-combobox"));
    await user.click(screen.getByRole("button", { name: "Add relation" }));

    expect(
      await screen.findByText("The selected relationship is not allowed."),
    ).toBeInTheDocument();
  });

  it("deletes a relation when the remove button is clicked", async () => {
    const user = userEvent.setup();
    mockedDeleteRelation.mockResolvedValue(undefined);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel
          relations={relations}
          resourceId={1}
        />
      </NextIntlClientProvider>,
    );

    const removeButton = screen.getByRole("button", {
      name: /Remove this relation/i,
    });
    await user.click(removeButton);

    // Confirm the deletion in the AlertDialog
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockedDeleteRelation).toHaveBeenCalledWith(1);
    });

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("waits for deletion success, removes only that row, and ignores stale refreshed props", async () => {
    const user = userEvent.setup();
    let resolveDelete: () => void;
    mockedDeleteRelation.mockReturnValue(new Promise<void>((resolve) => {
      resolveDelete = resolve;
    }));

    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={relationsInBothDirections} resourceId={1} />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getAllByRole("button", { name: /Remove this relation/i })[0]);
    expect(screen.getByText("This only removes the relation. The target resource is not archived.")).toBeInTheDocument();
    expect(screen.queryByText("Relation removed.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(mockedDeleteRelation).toHaveBeenCalledWith(1));
    expect(screen.getByRole("link", { name: "orders-cluster" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "orders-proxy" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    resolveDelete!();

    await waitFor(() => expect(screen.queryByRole("link", { name: "orders-cluster" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "orders-proxy" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Relation removed.");

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={[...relationsInBothDirections]} resourceId={1} />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByRole("link", { name: "orders-cluster" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "orders-proxy" })).toBeInTheDocument();
  });

  it("keeps overlapping row deletions independent and blocks duplicate requests", async () => {
    const user = userEvent.setup();
    let resolveFirstDelete: () => void;
    let resolveSecondDelete: () => void;
    mockedDeleteRelation
      .mockReturnValueOnce(new Promise<void>((resolve) => {
        resolveFirstDelete = resolve;
      }))
      .mockReturnValueOnce(new Promise<void>((resolve) => {
        resolveSecondDelete = resolve;
      }));

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel relations={relationsInBothDirections} resourceId={1} />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getAllByRole("button", { name: /Remove this relation/i })[0]);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await user.click(screen.getAllByRole("button", { name: /Remove this relation/i })[1]);
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockedDeleteRelation).toHaveBeenNthCalledWith(1, 1);
      expect(mockedDeleteRelation).toHaveBeenNthCalledWith(2, 2);
    });
    for (const button of screen.getAllByRole("button", { name: /Remove this relation/i })) {
      expect(button).toBeDisabled();
    }

    await user.click(screen.getAllByRole("button", { name: /Remove this relation/i })[1]);
    expect(mockedDeleteRelation).toHaveBeenCalledTimes(2);

    resolveFirstDelete!();
    await waitFor(() => expect(screen.queryByRole("link", { name: "orders-cluster" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Remove this relation/i })).toBeDisabled();

    resolveSecondDelete!();
    await waitFor(() => expect(screen.queryByRole("link", { name: "orders-proxy" })).not.toBeInTheDocument());
    expect(mockedDeleteRelation).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["en", enMessages, "Member Of · Outgoing", "Fronts · Incoming", "DB Cluster", "DB Proxy"],
    ["zh-CN", zhMessages, "归属 · 出向", "前置代理 · 入向", "数据库集群", "数据库代理"],
  ])(
    "localizes relation types, directions, and resource types in %s",
    (locale, localizedMessages, firstRelation, secondRelation, firstType, secondType) => {
      render(
        <NextIntlClientProvider locale={locale} messages={localizedMessages}>
          <ResourceRelationPanel relations={relationsInBothDirections} />
        </NextIntlClientProvider>,
      );

      expect(screen.getByText(firstRelation)).toBeInTheDocument();
      expect(screen.getByText(secondRelation)).toBeInTheDocument();
      expect(screen.getByText(firstType)).toBeInTheDocument();
      expect(screen.getByText(secondType)).toBeInTheDocument();
    },
  );

  it("shows no error when delete succeeds (204)", async () => {
    const user = userEvent.setup();
    mockedDeleteRelation.mockResolvedValue(undefined);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel
          relations={relations}
          resourceId={1}
        />
      </NextIntlClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: /Remove this relation/i }),
    );

    // Confirm the deletion in the AlertDialog
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockedDeleteRelation).toHaveBeenCalledWith(1);
    });

    expect(refresh).toHaveBeenCalledOnce();

    // No error message should appear
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows not-found error when delete fails with 404", async () => {
    const user = userEvent.setup();
    mockedDeleteRelation.mockRejectedValue(
      new ApiError(404, "Not Found"),
    );

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel
          relations={relations}
          resourceId={1}
        />
      </NextIntlClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: /Remove this relation/i }),
    );

    // Confirm the deletion in the AlertDialog
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(
        screen.getByText("The target resource was not found."),
      ).toBeInTheDocument();
    });
  });

  it("shows backend error and preserves relation when delete fails with 500", async () => {
    const user = userEvent.setup();
    mockedDeleteRelation.mockRejectedValue(
      new ApiError(500, "Internal Server Error"),
    );

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceRelationPanel
          relations={relations}
          resourceId={1}
        />
      </NextIntlClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: /Remove this relation/i }),
    );

    // Confirm the deletion in the AlertDialog
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(
        screen.getByText("The backend service is not available. Please try again later."),
      ).toBeInTheDocument();
    });

    // Relation should still be visible in the list
    expect(screen.getByText("orders-cluster")).toBeInTheDocument();
  });
});
