import { PageHeader } from "@/components/blocks/page-header";
import { ResourceTable } from "@/components/resources/resource-table";
import { Button } from "@/components/ui/button";
import { listResourceViewModels } from "@/lib/view-models";

export default async function ResourcesPage() {
  const resources = await listResourceViewModels();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Resources"
        title="Unified resource inventory"
        description="Search, filter, and inspect manually managed assets from a single operational list. Row click opens the right-side detail panel."
        actions={<Button size="sm">Register Resource</Button>}
      />

      <ResourceTable resources={resources} />
    </div>
  );
}
