import { DetailPanel } from "@/components/blocks/detail-panel";
import { PageHeader } from "@/components/blocks/page-header";
import { DatabaseTable } from "@/components/databases/database-table";
import { listDatabaseResourceViewModels } from "@/lib/view-models";

export default async function DatabasesPage() {
  const databaseResources = await listDatabaseResourceViewModels();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Databases"
        title="Database clusters and instances"
        description="Clusters and instances are first-class resources from phase 1, with shared ownership and audit flows."
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <DatabaseTable resources={databaseResources} />
        <DetailPanel
          title="Database posture"
          description="The console keeps clusters visible as logical containers without forcing heavy topology views."
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Cluster records
              </p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {
                  databaseResources.filter(
                    (resource) => resource.resourceType === "database_cluster",
                  ).length
                }
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Instance records
              </p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {
                  databaseResources.filter(
                    (resource) => resource.resourceType === "database_instance",
                  ).length
                }
              </p>
            </div>
          </div>
        </DetailPanel>
      </div>
    </div>
  );
}
