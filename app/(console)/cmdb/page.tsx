import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";

export default async function CmdbPage() {
  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("pages.cmdb.eyebrow")}
        title={t("pages.cmdb.title")}
        description={t("pages.cmdb.description")}
      />
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t("pages.cmdb.message")}</p>
        <Link
          href="/resources"
          className="mt-4 inline-flex text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring/50"
        >
          {t("pages.cmdb.openResources")}
        </Link>
      </div>
    </div>
  );
}
