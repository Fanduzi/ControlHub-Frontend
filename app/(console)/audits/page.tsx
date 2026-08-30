// input: Next search params/cookies, environment catalog, audit view models
// output: admin audit page with URL-or-persisted, fail-closed environment-scoped server results
// pos: authenticated console audit route
// note: if this file changes, update this header and app/(console)/README.md
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { AuditTable } from "@/components/audits/audit-table";
import { resolveEnvironmentSlugToId } from "@/lib/environment-params";
import { parseAuditListSearchParams } from "@/lib/list-page-search-params";
import { ENVIRONMENT_STORAGE_KEY, parseEnvironmentId } from "@/lib/preferences";
import { listAuditEventViewModels } from "@/lib/view-models";

export default async function AuditsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const parsedParams = await parseAuditListSearchParams(searchParams);
  const persistedEnvironmentId = parsedParams.environmentSlug
    ? null
    : parseEnvironmentId((await cookies()).get(ENVIRONMENT_STORAGE_KEY)?.value);
  const params = await resolveEnvironmentSlugToId(
    persistedEnvironmentId === null
      ? parsedParams
      : { ...parsedParams, environmentId: persistedEnvironmentId },
  );

  if (!params) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("pages.audits.eyebrow")}
          title={t("pages.audits.title")}
          description={t("pages.audits.description")}
        />
        <AuditTable events={[]} pageInfo={{
          page: parsedParams.page ?? 1,
          pageSize: parsedParams.pageSize ?? 10,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        }} />
      </div>
    );
  }

  const { items: events, pageInfo } = await listAuditEventViewModels(params);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("pages.audits.eyebrow")}
        title={t("pages.audits.title")}
        description={t("pages.audits.description")}
      />
      <AuditTable events={events} pageInfo={pageInfo} />
    </div>
  );
}
