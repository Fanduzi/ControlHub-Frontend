import { render, screen } from "@testing-library/react";

import { ResourceDetailSheet } from "@/components/resources/resource-detail-sheet";

const resource = {
  id: "res-db-primary",
  resourceType: "database_instance",
  resourceSubtype: "mysql",
  name: "orders-db-primary",
  displayName: "Orders DB Primary",
  environmentId: "env-prod",
  environmentName: "Production",
  ownerId: "owner-dba",
  ownerName: "DBA Team",
  lifecycleStatus: "running",
  healthStatus: "degraded",
  source: "manual",
  externalId: "aws:rds:orders-primary",
  createdAt: "2026-04-11T12:00:00Z",
  updatedAt: "2026-04-11T13:00:00Z",
  labels: {
    team: "order",
    role: "primary",
  },
  summary: "Primary transactional database handling checkout and order writes.",
  profile: {
    engine: "MySQL 8.0",
    endpoint: "orders-primary.internal:3306",
    region: "ap-southeast-1",
  },
  relations: [
    {
      id: "rel-cluster",
      fromResourceId: "res-db-primary",
      toResourceId: "res-db-cluster-orders",
      relationType: "member_of",
      createdAt: "2026-04-11T13:00:00Z",
      relatedResourceId: "res-db-cluster-orders",
      relatedResourceName: "orders-cluster",
      direction: "outgoing",
    },
  ],
  auditEvents: [
    {
      id: "audit-1",
      actorUserId: "user-admin",
      targetResourceId: "res-db-primary",
      eventType: "resource.updated",
      result: "success",
      createdAt: "2026-04-11T13:00:00Z",
      actorLabel: "Admin User",
      targetResourceName: "Orders DB Primary",
      environmentLabel: "Production",
      summary: "Updated lifecycle status and owner mapping.",
    },
  ],
};

describe("ResourceDetailSheet", () => {
  it("renders the selected resource with summary, relations, and audit context", () => {
    render(
      <ResourceDetailSheet
        open
        onOpenChange={() => undefined}
        resource={resource}
      />,
    );

    expect(screen.getByText("Orders DB Primary")).toBeInTheDocument();
    expect(screen.getByText("Primary transactional database handling checkout and order writes.")).toBeInTheDocument();
    expect(screen.getByText("orders-primary.internal:3306")).toBeInTheDocument();
    expect(screen.getByText("orders-cluster")).toBeInTheDocument();
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open full detail/i }),
    ).toHaveAttribute("href", "/resources/res-db-primary");
  });

  it("shows empty states when no relations or audit events are present", () => {
    render(
      <ResourceDetailSheet
        open
        onOpenChange={() => undefined}
        resource={{
          ...resource,
          relations: [],
          auditEvents: [],
        }}
      />,
    );

    expect(screen.getByText("No linked resources")).toBeInTheDocument();
    expect(screen.getByText("No audit activity yet")).toBeInTheDocument();
  });
});
