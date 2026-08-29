// input: next-intl, page header, environment topology content
// output: dedicated current-environment topology route
// pos: console topology entry point
import { getTranslations } from "next-intl/server";

import { EnvironmentTopologyContent } from "@/components/blocks/environment-topology-content";
import { PageHeader } from "@/components/blocks/page-header";

export default async function TopologyPage() {
  const t = await getTranslations("topology");

  return (
    <div className="space-y-6">
      <PageHeader title={t("environmentTitle")} description={t("environmentDescription")} />
      <EnvironmentTopologyContent />
    </div>
  );
}
