// input: Next search params/cookies, environment catalog, audit view models
// output: admin audit page with URL-or-persisted, fail-closed environment-scoped server results and a localized forbidden notice for non-admin operators
// pos: authenticated console audit route
// note: if this file changes, update this header and app/(console)/README.md
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { AuditTable } from "@/components/audits/audit-table";
import { ApiError } from "@/services/api-client";
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

  let events: Awaited<ReturnType<typeof listAuditEventViewModels>>["items"];
  let pageInfo: Awaited<ReturnType<typeof listAuditEventViewModels>>["pageInfo"];
  try {
    ({ items: events, pageInfo } = await listAuditEventViewModels(params));
  } catch (error) {
    // Audit reads are admin-only server-side. Editors who reach this
    // route directly get a localized forbidden notice instead of the
    // generic backend-down error boundary.
    if (error instanceof ApiError && error.status === 403) {
      return (
        <div className="space-y-6">
          <PageHeader
            eyebrow={t("pages.audits.eyebrow")}
            title={t("pages.audits.title")}
            description={t("pages.audits.description")}
          />
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-5">
            <p className="text-sm font-medium text-destructive">
              {t("errors.title")}
            </p>
            <p className="mt-1 text-sm text-destructive/80">
              {t("errors.forbidden")}
            </p>
          </div>
        </div>
      );
    }
    throw error;
  }

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
