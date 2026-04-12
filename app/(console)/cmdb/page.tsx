import { DetailPanel } from "@/components/blocks/detail-panel";
import { EmptyState } from "@/components/blocks/empty-state";
import { PageHeader } from "@/components/blocks/page-header";
import { StatusBadge } from "@/components/blocks/status-badge";
import { formatDateTime } from "@/lib/format";
import { listResourceViewModels } from "@/lib/view-models";

export default async function CmdbPage() {
  const resources = await listResourceViewModels();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CMDB"
        title="Configuration maintenance view"
        description="The CMDB page reuses the shared resource foundation but emphasizes maintenance ownership, source quality, and update cadence."
      />

      <DetailPanel
        title="Configuration records"
        description="High-signal configuration fields aligned with the phase 1 resource model."
      >
        {resources.length === 0 ? (
          <EmptyState
            title="No configuration records"
            description="Resources will appear here once they are registered through the resource inventory."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-3 pr-4 font-medium">Resource</th>
                  <th className="py-3 pr-4 font-medium">Owner</th>
                  <th className="py-3 pr-4 font-medium">Environment</th>
                  <th className="py-3 pr-4 font-medium">Source</th>
                  <th className="py-3 pr-4 font-medium">Lifecycle</th>
                  <th className="py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((resource) => (
                  <tr
                    key={resource.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="py-3 pr-4">
                      <p className="font-medium text-foreground">
                        {resource.displayName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {resource.id}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-foreground">
                      {resource.ownerName}
                    </td>
                    <td className="py-3 pr-4 text-foreground">
                      {resource.environmentName}
                    </td>
                    <td className="py-3 pr-4 text-foreground">
                      {resource.source}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge
                        status={resource.lifecycleStatus}
                        tone="lifecycle"
                      />
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {formatDateTime(resource.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailPanel>
    </div>
  );
}
